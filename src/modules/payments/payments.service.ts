import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Razorpay = require('razorpay');
import { createHmac } from 'crypto';
import { User } from '../users/schemas/user.schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';
import { Subscription, SubscriptionStatus } from '../billing/schemas/subscription.schema';
import { SYSTEM_PLANS } from '../billing/subscription.service';

export const PLANS = {
  free:       { name: 'Free',       price: 0,      currency: 'INR', events: 1_000,   endpoints: 3,   retention: 7   },
  starter:    { name: 'Starter',    price: 2499,   currency: 'INR', events: 50_000,  endpoints: 20,  retention: 30  },
  pro:        { name: 'Pro',        price: 8299,   currency: 'INR', events: 500_000, endpoints: 100, retention: 90  },
  enterprise: { name: 'Enterprise', price: 33299,  currency: 'INR', events: -1,      endpoints: -1,  retention: 365 },
};

@Injectable()
export class PaymentsService {
  private razorpay: any;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(User.name)         private userModel: Model<User>,
    @InjectModel(Subscription.name) private subModel:  Model<Subscription>,
    private config: ConfigService,
    private auditService: AuditService,
  ) {
    this.razorpay = new Razorpay({
      key_id:    config.get('RAZORPAY_KEY_ID'),
      key_secret: config.get('RAZORPAY_KEY_SECRET'),
    });
  }

  getPlans() {
    return Object.entries(PLANS).map(([key, plan]) => ({ id: key, ...plan }));
  }

  async createOrder(userId: string, planId: string, ip: string) {
    const plan = PLANS[planId];
    if (!plan || plan.price === 0) throw new BadRequestException('Invalid plan or free plan selected');
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const order = await this.razorpay.orders.create({
      amount: plan.price * 100,
      currency: 'INR',
      receipt: `order_${userId}_${planId}_${Date.now()}`,
      notes: { userId, planId, userEmail: (user as any).email },
    });

    await this.auditService.log({ userId, action: AuditAction.BILLING_PAYMENT_ATTEMPT, metadata: { planId, orderId: order.id }, ipAddress: ip });
    return {
      orderId: order.id, amount: order.amount, currency: order.currency,
      keyId: this.config.get('RAZORPAY_KEY_ID'),
      prefill: { name: (user as any).fullName || `${(user as any).firstName} ${(user as any).lastName}`, email: (user as any).email },
    };
  }

  async verifyPayment(userId: string, dto: { orderId: string; paymentId: string; signature: string; planId: string }, ip: string) {
    const body = `${dto.orderId}|${dto.paymentId}`;
    const expectedSig = createHmac('sha256', this.config.get('RAZORPAY_KEY_SECRET') || '').update(body).digest('hex');
    if (expectedSig !== dto.signature) throw new BadRequestException('Invalid payment signature');

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 3600_000);

    await this.userModel.findByIdAndUpdate(userId, {
      plan: dto.planId, razorpayOrderId: dto.orderId, razorpayPaymentId: dto.paymentId,
      subscriptionStartAt: now, subscriptionEndAt: periodEnd,
    });

    // Sync new Subscription model
    const planMeta = SYSTEM_PLANS[dto.planId];
    if (planMeta) {
      await this.subModel.findOneAndUpdate({ userId }, {
        planId: dto.planId, planName: planMeta.name!, status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now, currentPeriodEnd: periodEnd,
        lastPaymentId: dto.paymentId, lastPaymentAt: now,
        eventsPerMonth: planMeta.eventsPerMonth!, endpointsLimit: planMeta.endpointsLimit!, retentionDays: planMeta.retentionDays!,
      }, { upsert: true });
    }

    await this.auditService.log({ userId, action: AuditAction.BILLING_PAYMENT_SUCCESS, metadata: { planId: dto.planId, paymentId: dto.paymentId }, ipAddress: ip });
    return { message: 'Payment verified. Plan upgraded.', plan: dto.planId };
  }

  async handleWebhook(body: any, signature: string) {
    const secret = this.config.get('RAZORPAY_WEBHOOK_SECRET') || '';
    const digest = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    if (digest !== signature) throw new BadRequestException('Invalid webhook signature');

    const event = body.event as string;
    this.logger.log(`Razorpay webhook: ${event}`);

    // ─── payment.captured ────────────────────────────────────────────────────
    if (event === 'payment.captured') {
      const payment = body.payload?.payment?.entity;
      const { userId, planId } = payment?.notes ?? {};
      if (userId && planId) {
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 3600_000);
        await this.userModel.findByIdAndUpdate(userId, {
          plan: planId, razorpayPaymentId: payment.id,
          subscriptionStartAt: now, subscriptionEndAt: periodEnd,
        });
        const planMeta = SYSTEM_PLANS[planId];
        if (planMeta) {
          await this.subModel.findOneAndUpdate({ userId }, {
            planId, planName: planMeta.name!, status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: now, currentPeriodEnd: periodEnd,
            lastPaymentId: payment.id, lastPaymentAt: now,
            eventsPerMonth: planMeta.eventsPerMonth!, endpointsLimit: planMeta.endpointsLimit!, retentionDays: planMeta.retentionDays!,
          }, { upsert: true });
        }
        this.logger.log(`Plan activated for user ${userId}: ${planId}`);
      }
    }

    // ─── subscription.charged (auto-renewal) ─────────────────────────────────
    if (event === 'subscription.charged') {
      const sub  = body.payload?.subscription?.entity;
      const pmt  = body.payload?.payment?.entity;
      const userId = sub?.notes?.userId;
      const planId = sub?.notes?.planId;
      if (userId && planId) {
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 30 * 24 * 3600_000);
        await this.subModel.findOneAndUpdate({ userId }, {
          status: SubscriptionStatus.ACTIVE, currentPeriodStart: now, currentPeriodEnd: periodEnd,
          lastPaymentId: pmt?.id, lastPaymentAt: now,
        }, { upsert: true });
        await this.userModel.findByIdAndUpdate(userId, { subscriptionStartAt: now, subscriptionEndAt: periodEnd });
        this.logger.log(`Subscription auto-renewed for user ${userId}`);
      }
    }

    // ─── subscription.halted / payment.failed ────────────────────────────────
    if (event === 'subscription.halted' || event === 'payment.failed') {
      const payment = body.payload?.payment?.entity ?? body.payload?.subscription?.entity;
      const userId  = payment?.notes?.userId;
      if (userId) {
        await this.subModel.findOneAndUpdate({ userId }, { status: SubscriptionStatus.PAST_DUE });
        await this.auditService.log({ userId, action: AuditAction.BILLING_PAYMENT_FAILED, metadata: { event, paymentId: payment?.id } });
        this.logger.warn(`Payment failed / subscription halted for user ${userId}`);
      }
    }

    // ─── subscription.cancelled ──────────────────────────────────────────────
    if (event === 'subscription.cancelled') {
      const sub    = body.payload?.subscription?.entity;
      const userId = sub?.notes?.userId;
      if (userId) {
        await this.subModel.findOneAndUpdate({ userId }, { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date(), cancelReason: 'Cancelled via Razorpay' });
      }
    }

    return { received: true };
  }
}
