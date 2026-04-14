import {
  Injectable, Logger, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Reseller, ResellerCustomer } from './schemas/reseller.schema';
import { Subscription, SubscriptionStatus } from './schemas/subscription.schema';
import { Invoice, InvoiceType, InvoiceStatus } from './schemas/invoice.schema';
import { User } from '../users/schemas/user.schema';
import { Plan } from './schemas/plan.schema';

@Injectable()
export class ResellerService {
  private readonly logger = new Logger(ResellerService.name);

  constructor(
    @InjectModel(Reseller.name)         private resellerModel:  Model<Reseller>,
    @InjectModel(ResellerCustomer.name) private rcModel:        Model<ResellerCustomer>,
    @InjectModel(Subscription.name)     private subModel:       Model<Subscription>,
    @InjectModel(Invoice.name)          private invoiceModel:   Model<Invoice>,
    @InjectModel(User.name)             private userModel:      Model<User>,
    @InjectModel(Plan.name)             private planModel:      Model<Plan>,
  ) {}

  async getProfile(userId: string): Promise<Reseller> {
    const r = await this.resellerModel.findOne({ userId });
    if (!r) throw new NotFoundException('Reseller profile not found. Upgrade to Enterprise plan.');
    return r;
  }

  async upsertProfile(userId: string, dto: {
    companyName: string;
    logoUrl?: string;
    supportEmail?: string;
    webhookPortalDomain?: string;
    defaultMarkupPct?: number;
    pricePerThousandEvents?: number;
  }): Promise<Reseller> {
    return this.resellerModel.findOneAndUpdate(
      { userId },
      { ...dto, userId },
      { upsert: true, new: true },
    );
  }

  async addCustomer(resellerId: string, dto: {
    customerEmail: string;
    planId?: string;
    markupPct?: number;
    pricePerThousandEvents?: number;
    notes?: string;
  }) {
    const customer = await this.userModel.findOne({ email: dto.customerEmail.toLowerCase() });
    if (!customer) throw new NotFoundException(`No user found with email: ${dto.customerEmail}`);

    const exists = await this.rcModel.findOne({ resellerId, customerId: customer.id });
    if (exists) throw new ConflictException('Customer already added to this reseller account');

    const rc = await this.rcModel.create({
      resellerId,
      customerId: customer.id,
      planId: dto.planId ?? null,
      markupPct: dto.markupPct ?? 0,
      pricePerThousandEvents: dto.pricePerThousandEvents ?? 100,
      billingCycleStart: new Date(),
      billingCycleEnd: this.nextMonthEnd(),
      notes: dto.notes ?? '',
    });

    await this.subModel.findOneAndUpdate(
      { userId: customer.id },
      {
        resellerId,
        status: SubscriptionStatus.ACTIVE,
        planId: dto.planId ?? 'reseller_custom',
        planName: 'Reseller Custom',
        currentPeriodStart: new Date(),
        currentPeriodEnd: this.nextMonthEnd(),
      },
      { upsert: true, new: true },
    );

    return rc;
  }

  async listCustomers(resellerId: string): Promise<any[]> {
    const customers = await this.rcModel.find({ resellerId }).lean();
    const enriched = await Promise.all(customers.map(async c => {
      const user = await this.userModel.findById(c.customerId).lean();
      return {
        ...c,
        customer: user
          ? { id: user._id, email: (user as any).email, firstName: (user as any).firstName, lastName: (user as any).lastName }
          : null,
      };
    }));
    return enriched;
  }

  async suspendCustomer(resellerId: string, customerId: string) {
    const rc = await this.rcModel.findOne({ resellerId, customerId });
    if (!rc) throw new NotFoundException('Customer not found in your account');
    await this.rcModel.findByIdAndUpdate(rc._id, { isActive: false, suspendedAt: new Date() });
    await this.subModel.findOneAndUpdate(
      { userId: customerId, resellerId },
      { status: SubscriptionStatus.SUSPENDED },
    );
    return { message: 'Customer suspended' };
  }

  async reactivateCustomer(resellerId: string, customerId: string) {
    const rc = await this.rcModel.findOne({ resellerId, customerId });
    if (!rc) throw new NotFoundException('Customer not found in your account');
    await this.rcModel.findByIdAndUpdate(rc._id, { isActive: true, suspendedAt: null });
    await this.subModel.findOneAndUpdate(
      { userId: customerId, resellerId },
      { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: this.nextMonthEnd() },
    );
    return { message: 'Customer reactivated' };
  }

  async incrementCustomerUsage(customerId: string, events: number) {
    await this.rcModel.findOneAndUpdate(
      { customerId, isActive: true },
      { $inc: { currentMonthEvents: events } },
    );
  }

  async generateMonthlyInvoices(resellerId: string) {
    const customers = await this.rcModel.find({ resellerId, isActive: true });
    const generated: any[] = [];

    for (const rc of customers) {
      if (rc.currentMonthEvents === 0) continue;

      const amountPaise = Math.round((rc.currentMonthEvents / 1000) * rc.pricePerThousandEvents);
      const tax = Math.round(amountPaise * 0.18);
      const invoiceNumber = await this.nextInvoiceNumber();

      const invoice = await this.invoiceModel.create({
        userId: rc.customerId,
        resellerId,
        customerId: rc.customerId,
        type: InvoiceType.USAGE,
        status: InvoiceStatus.OPEN,
        invoiceNumber,
        periodStart: rc.billingCycleStart,
        periodEnd: rc.billingCycleEnd ?? new Date(),
        lineItems: [{
          description: `Webhook Delivery — ${rc.currentMonthEvents.toLocaleString()} events`,
          quantity: rc.currentMonthEvents,
          unitPrice: rc.pricePerThousandEvents,
          amount: amountPaise,
        }],
        subtotal: amountPaise,
        tax,
        total: amountPaise + tax,
        currency: 'INR',
        eventsDelivered: rc.currentMonthEvents,
        pricePerThousand: rc.pricePerThousandEvents,
        dueDate: new Date(Date.now() + 7 * 24 * 3600_000),
      });

      await this.rcModel.findByIdAndUpdate(rc._id, {
        currentMonthEvents: 0,
        billingCycleStart: new Date(),
        billingCycleEnd: this.nextMonthEnd(),
      });

      generated.push({ customerId: rc.customerId, invoiceNumber, total: amountPaise + tax });
    }

    const totalNew = generated.reduce((s, i) => s + i.total, 0);
    await this.resellerModel.findOneAndUpdate(
      { userId: resellerId },
      { $inc: { totalRevenueCollected: totalNew } },
    );

    this.logger.log(`Generated ${generated.length} invoices for reseller ${resellerId}`);
    return { generated: generated.length, invoices: generated };
  }

  @Cron('0 1 1 * *')
  async autoGenerateAllMonthlyInvoices() {
    const resellers = await this.resellerModel.find({ isActive: true }).lean();
    for (const r of resellers) {
      try {
        await this.generateMonthlyInvoices(r.userId);
      } catch (err: any) {
        this.logger.error(`Failed to generate invoices for reseller ${r.userId}: ${err.message}`);
      }
    }
  }

  async getCustomerInvoices(resellerId: string, customerId: string) {
    return this.invoiceModel.find({ resellerId, customerId }).sort({ createdAt: -1 }).lean();
  }

  async getResellerRevenue(resellerId: string) {
    const agg = await this.invoiceModel.aggregate([
      { $match: { resellerId, status: InvoiceStatus.PAID } },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]);
    const profile = await this.resellerModel.findOne({ userId: resellerId }).lean();
    return {
      totalCollected: agg[0]?.total ?? 0,
      paidInvoices: agg[0]?.count ?? 0,
      totalCustomers: (profile as any)?.totalCustomers ?? 0,
    };
  }

  private nextMonthEnd(): Date {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private async nextInvoiceNumber(): Promise<string> {
    const count = await this.invoiceModel.countDocuments();
    const pad = String(count + 1).padStart(6, '0');
    return `INV-${new Date().getFullYear()}-${pad}`;
  }
}

