import {
  Injectable, Logger, NotFoundException,
  BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { createHmac } from 'crypto';
import { Subscription, SubscriptionStatus } from './schemas/subscription.schema';
import { Plan, PlanType } from './schemas/plan.schema';
import { Invoice, InvoiceType, InvoiceStatus } from './schemas/invoice.schema';
import { User } from '../users/schemas/user.schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Razorpay = require('razorpay');

// ─── Built-in system plans ────────────────────────────────────────────────────
export const SYSTEM_PLANS: Record<string, Partial<Plan>> = {
  trial: {
    name: 'Free Trial', priceMonthly: 0, eventsPerMonth: 5_000,
    endpointsLimit: 5, retentionDays: 7, projectsLimit: 1, teamMembersLimit: 2,
    analyticsEnabled: false, aiEnabled: false,
  },
  starter: {
    name: 'Starter', priceMonthly: 249900, eventsPerMonth: 50_000,
    endpointsLimit: 20, retentionDays: 30, projectsLimit: 3, teamMembersLimit: 5,
    analyticsEnabled: true, aiEnabled: false,
  },
  pro: {
    name: 'Pro', priceMonthly: 829900, eventsPerMonth: 500_000,
    endpointsLimit: 100, retentionDays: 90, projectsLimit: 10, teamMembersLimit: 20,
    analyticsEnabled: true, aiEnabled: true, slaMonitoringEnabled: true,
    priorityQueueEnabled: true, eventCatalogEnabled: true,
  },
  enterprise: {
    name: 'Enterprise', priceMonthly: 3329900, eventsPerMonth: -1,
    endpointsLimit: -1, retentionDays: 365, projectsLimit: -1, teamMembersLimit: -1,
    analyticsEnabled: true, aiEnabled: true, slaMonitoringEnabled: true,
    resellerEnabled: true, mtlsEnabled: true, customDomainsEnabled: true,
    priorityQueueEnabled: true, eventCatalogEnabled: true,
  },
};

@Injectable()
export class SubscriptionService {
  private razorpay: any;
  private readonly logger = new Logger(SubscriptionService.name);
  private invoiceCounter = 0;

  constructor(
    @InjectModel(Subscription.name) private subModel: Model<Subscription>,
    @InjectModel(Plan.name)         private planModel: Model<Plan>,
    @InjectModel(Invoice.name)      private invoiceModel: Model<Invoice>,
    @InjectModel(User.name)         private userModel: Model<User>,
    private config: ConfigService,
    private auditService: AuditService,
  ) {
    this.razorpay = new Razorpay({
      key_id: config.get('RAZORPAY_KEY_ID'),
      key_secret: config.get('RAZORPAY_KEY_SECRET') || '',
    });
  }

  // ─── Plans ──────────────────────────────────────────────────────────────────

  getSystemPlans() {
    return Object.entries(SYSTEM_PLANS).map(([id, p]) => ({
      id,
      name: p.name,
      priceMonthly: p.priceMonthly,
      currency: 'INR',
      eventsPerMonth: p.eventsPerMonth,
      endpointsLimit: p.endpointsLimit,
      retentionDays: p.retentionDays,
      features: {
        analytics: p.analyticsEnabled,
        ai: p.aiEnabled,
        slaMonitoring: p.slaMonitoringEnabled,
        reseller: p.resellerEnabled,
        mtls: p.mtlsEnabled,
        customDomains: p.customDomainsEnabled,
        priorityQueue: p.priorityQueueEnabled,
        eventCatalog: p.eventCatalogEnabled,
      },
    }));
  }

  async getCustomPlans(resellerId: string) {
    return this.planModel.find({ resellerId, type: PlanType.RESELLER, isActive: true }).lean();
  }

  async createCustomPlan(resellerId: string, dto: {
    name: string; description?: string;
    priceMonthly: number; eventsPerMonth: number;
    endpointsLimit: number; retentionDays: number;
  }) {
    return this.planModel.create({
      ...dto,
      type: PlanType.RESELLER,
      resellerId,
      currency: 'INR',
      isActive: true,
    });
  }

  // ─── Current subscription ───────────────────────────────────────────────────

  async getMySubscription(userId: string) {
    const sub = await this.subModel.findOne({ userId });
    if (!sub) return { status: 'none', message: 'No subscription found. Contact support.' };

    const now = new Date();
    let daysLeft: number | null = null;
    if (sub.status === SubscriptionStatus.TRIAL && sub.trialEndAt) {
      daysLeft = Math.max(0, Math.ceil((sub.trialEndAt.getTime() - now.getTime()) / 86_400_000));
    }
    if (sub.status === SubscriptionStatus.ACTIVE && sub.currentPeriodEnd) {
      daysLeft = Math.max(0, Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / 86_400_000));
    }

    return { ...sub.toObject(), daysLeft };
  }

  // ─── Create Razorpay order for upgrade ──────────────────────────────────────

  async createUpgradeOrder(userId: string, planId: string, ip: string) {
    const planMeta = SYSTEM_PLANS[planId];
    if (!planMeta) throw new BadRequestException(`Unknown plan: ${planId}`);
    if (planId === 'trial') throw new BadRequestException('Cannot purchase trial plan');
    if (!planMeta.priceMonthly) throw new BadRequestException('This plan requires custom pricing');

    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const amount = planMeta.priceMonthly; // already in paise

    const order = await this.razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `sub_${userId}_${planId}_${Date.now()}`,
      notes: { userId, planId, type: 'subscription_upgrade' },
    });

    await this.auditService.log({
      userId, action: AuditAction.BILLING_PAYMENT_ATTEMPT,
      metadata: { planId, orderId: order.id }, ipAddress: ip,
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: this.config.get('RAZORPAY_KEY_ID'),
      planId,
      planName: planMeta.name,
      prefill: {
        name: user.fullName || `${user.firstName} ${user.lastName}`,
        email: user.email,
      },
    };
  }

  // ─── Verify upgrade payment & activate subscription ─────────────────────────

  async verifyUpgradePayment(userId: string, dto: {
    orderId: string; paymentId: string; signature: string; planId: string;
  }, ip: string) {
    const body = `${dto.orderId}|${dto.paymentId}`;
    const expected = createHmac('sha256', this.config.get('RAZORPAY_KEY_SECRET') || '')
      .update(body).digest('hex');
    if (expected !== dto.signature) throw new BadRequestException('Invalid payment signature');

    const planMeta = SYSTEM_PLANS[dto.planId];
    if (!planMeta) throw new BadRequestException('Invalid plan');

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 3600_000);

    const sub = await this.subModel.findOneAndUpdate(
      { userId },
      {
        planId: dto.planId,
        planName: planMeta.name!,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        lastPaymentId: dto.paymentId,
        lastPaymentAt: now,
        eventsPerMonth: planMeta.eventsPerMonth!,
        endpointsLimit: planMeta.endpointsLimit!,
        retentionDays: planMeta.retentionDays!,
      },
      { upsert: true, new: true },
    );

    // Also update user.plan for backward compat
    await this.userModel.findByIdAndUpdate(userId, {
      plan: dto.planId,
      subscriptionStartAt: now,
      subscriptionEndAt: periodEnd,
      razorpayPaymentId: dto.paymentId,
    });

    // Generate invoice
    const invoice = await this.generateSubscriptionInvoice(userId, dto.planId, planMeta, dto.paymentId, now, periodEnd);

    await this.auditService.log({
      userId, action: AuditAction.BILLING_PAYMENT_SUCCESS,
      metadata: { planId: dto.planId, paymentId: dto.paymentId }, ipAddress: ip,
    });

    return {
      message: 'Subscription activated successfully',
      subscription: sub,
      invoice: { id: invoice._id, invoiceNumber: invoice.invoiceNumber },
    };
  }

  // ─── Cancel subscription ─────────────────────────────────────────────────────

  async cancelSubscription(userId: string, reason?: string) {
    const sub = await this.subModel.findOne({ userId });
    if (!sub || sub.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('No active subscription to cancel');
    }
    await this.subModel.findByIdAndUpdate(sub._id, {
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelReason: reason || 'User requested cancellation',
      autoRenew: false,
    });
    return { message: 'Subscription cancelled. Access continues until current period end.' };
  }

  // ─── Invoice generation ──────────────────────────────────────────────────────

  private async generateSubscriptionInvoice(
    userId: string, planId: string, planMeta: any,
    paymentId: string, periodStart: Date, periodEnd: Date,
  ): Promise<Invoice> {
    const invoiceNumber = await this.nextInvoiceNumber();
    const amount = planMeta.priceMonthly as number;
    const tax = Math.round(amount * 0.18); // 18% GST

    return this.invoiceModel.create({
      userId,
      type: InvoiceType.SUBSCRIPTION,
      status: InvoiceStatus.PAID,
      invoiceNumber,
      periodStart,
      periodEnd,
      lineItems: [{
        description: `${planMeta.name} Plan — Monthly Subscription`,
        quantity: 1,
        unitPrice: amount,
        amount,
      }],
      subtotal: amount,
      tax,
      total: amount + tax,
      currency: 'INR',
      razorpayPaymentId: paymentId,
      paidAt: new Date(),
      dueDate: new Date(),
    });
  }

  async getInvoices(userId: string) {
    return this.invoiceModel.find({ userId }).sort({ createdAt: -1 }).lean();
  }

  async getInvoiceById(userId: string, invoiceId: string) {
    const inv = await this.invoiceModel.findOne({ _id: invoiceId, userId });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  private async nextInvoiceNumber(): Promise<string> {
    const count = await this.invoiceModel.countDocuments();
    const pad = String(count + 1).padStart(6, '0');
    const year = new Date().getFullYear();
    return `INV-${year}-${pad}`;
  }
}
