import {
  Injectable, Logger, NotFoundException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { createHmac } from 'crypto';
import {
  CreditPackage, CreditBalance, CreditTransaction, CreditTxType,
  SalesInquiry, SalesInquiryStatus,
} from './schemas/credit-ledger.schema';
import { Invoice, InvoiceType, InvoiceStatus } from './schemas/invoice.schema';
import { Subscription, SubscriptionStatus } from './schemas/subscription.schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';

const Razorpay = require('razorpay');

export const CREDITS_PER_DELIVERY = 1;

export const CREDITS_PER_RETRY = 1;

@Injectable()
export class CreditsService {
  private razorpay: any;
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    @InjectModel(CreditPackage.name)     private pkgModel:     Model<CreditPackage>,
    @InjectModel(CreditBalance.name)     private balModel:     Model<CreditBalance>,
    @InjectModel(CreditTransaction.name) private txModel:      Model<CreditTransaction>,
    @InjectModel(Invoice.name)           private invoiceModel: Model<Invoice>,
    @InjectModel(Subscription.name)      private subModel:     Model<Subscription>,
    @InjectModel(SalesInquiry.name)      private salesModel:   Model<SalesInquiry>,
    private config: ConfigService,
    private auditService: AuditService,
  ) {
    this.razorpay = new Razorpay({
      key_id: config.get('RAZORPAY_KEY_ID'),
      key_secret: config.get('RAZORPAY_KEY_SECRET') || '',
    });
  }

  async getPackages() {
    return this.pkgModel.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  }

  async seedDefaultPackages() {
    const count = await this.pkgModel.countDocuments();
    if (count > 0) return;
    await this.pkgModel.insertMany([
      { name: 'Starter',    credits: 5_000,     bonusCredits: 0,         price: 99900,    description: 'Perfect for testing and small projects',                sortOrder: 1 },
      { name: 'Growth',     credits: 25_000,    bonusCredits: 2_500,     price: 499900,   description: 'For growing apps with steady webhook traffic',          sortOrder: 2 },
      { name: 'Business',   credits: 100_000,   bonusCredits: 15_000,    price: 1999900,  description: 'High-volume delivery with 15% bonus credits',          sortOrder: 3 },
      { name: 'Enterprise', credits: 500_000,   bonusCredits: 100_000,   price: 0,        description: 'Custom pricing for large-scale webhook infrastructure', sortOrder: 4, contactSales: true },
    ]);
    this.logger.log('Seeded default credit packages');
  }

  async getBalance(userId: string): Promise<CreditBalance> {
    let bal = await this.balModel.findOne({ userId });
    if (!bal) {
      bal = await this.balModel.create({ userId, balance: 0 });
    }
    return bal;
  }

  async getTransactions(userId: string, limit = 50, skip = 0) {
    return this.txModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async createPurchaseOrder(userId: string, packageId: string, ip: string) {
    const pkg = await this.pkgModel.findById(packageId);
    if (!pkg || !pkg.isActive) throw new NotFoundException('Credit package not found');

    const order = await this.razorpay.orders.create({
      amount: pkg.price,
      currency: 'INR',
      receipt: `credits_${userId}_${packageId}_${Date.now()}`,
      notes: { userId, packageId, type: 'credit_purchase', credits: pkg.credits + pkg.bonusCredits },
    });

    await this.auditService.log({
      userId, action: AuditAction.BILLING_PAYMENT_ATTEMPT,
      metadata: { packageId, credits: pkg.credits, orderId: order.id }, ipAddress: ip,
    });

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: this.config.get('RAZORPAY_KEY_ID'),
      package: { id: pkg._id, name: pkg.name, credits: pkg.credits, bonusCredits: pkg.bonusCredits },
    };
  }

  async verifyPurchase(userId: string, dto: {
    orderId: string; paymentId: string; signature: string; packageId: string;
  }, ip: string) {
    const body = `${dto.orderId}|${dto.paymentId}`;
    const expected = createHmac('sha256', this.config.get('RAZORPAY_KEY_SECRET') || '')
      .update(body).digest('hex');
    if (expected !== dto.signature) throw new BadRequestException('Invalid payment signature');

    const pkg = await this.pkgModel.findById(dto.packageId);
    if (!pkg) throw new NotFoundException('Package not found');

    const totalCredits = pkg.credits + pkg.bonusCredits;
    const newBal = await this.topUp(userId, totalCredits, CreditTxType.PURCHASE, {
      packageId: dto.packageId,
      razorpayPaymentId: dto.paymentId,
      description: `Purchased ${pkg.name}: ${totalCredits.toLocaleString()} credits`,
      invoiceId: null,
    });

    const invoiceNumber = await this.nextInvoiceNumber();
    const tax = Math.round(pkg.price * 0.18);
    await this.invoiceModel.create({
      userId,
      type: InvoiceType.CREDIT,
      status: InvoiceStatus.PAID,
      invoiceNumber,
      periodStart: new Date(),
      periodEnd: new Date(),
      lineItems: [{
        description: `${pkg.name} — ${totalCredits.toLocaleString()} Webhook Credits`,
        quantity: 1,
        unitPrice: pkg.price,
        amount: pkg.price,
      }],
      subtotal: pkg.price,
      tax,
      total: pkg.price + tax,
      currency: 'INR',
      razorpayPaymentId: dto.paymentId,
      paidAt: new Date(),
      dueDate: new Date(),
    });

    await this.subModel.updateOne(
      { userId, status: { $in: [SubscriptionStatus.TRIAL_EXPIRED, SubscriptionStatus.CANCELLED] } },
      { $set: { status: SubscriptionStatus.CREDIT_ONLY } },
    );

    await this.auditService.log({
      userId, action: AuditAction.BILLING_PAYMENT_SUCCESS,
      metadata: { packageId: dto.packageId, credits: totalCredits, paymentId: dto.paymentId }, ipAddress: ip,
    });

    return {
      message: `${totalCredits.toLocaleString()} credits added to your account`,
      balance: newBal.balance,
      invoiceNumber,
    };
  }

  async deductForDelivery(
    userId: string,
    opts: { projectId?: string; endpointId?: string; deliveryLogId?: string; attempts?: number },
  ): Promise<{ ok: boolean; balance: number; reason?: string }> {
    const amount = CREDITS_PER_DELIVERY + (opts.attempts || 0) * CREDITS_PER_RETRY;
    const bal = await this.balModel.findOne({ userId });
    if (!bal || bal.balance < amount) {
      return { ok: false, balance: bal?.balance ?? 0, reason: 'insufficient_credits' };
    }

    const updated = await this.balModel.findOneAndUpdate(
      { userId, balance: { $gte: amount } },
      { $inc: { balance: -amount, lifetimeUsed: amount } },
      { new: true },
    );
    if (!updated) return { ok: false, balance: bal.balance, reason: 'concurrent_depletion' };

    await this.txModel.create({
      userId,
      type: CreditTxType.USAGE,
      amount: -amount,
      balanceAfter: updated.balance,
      description: `Webhook delivery`,
      projectId: opts.projectId || null,
      endpointId: opts.endpointId || null,
      deliveryLogId: opts.deliveryLogId || null,
    });

    if (updated.balance <= (updated.lowBalanceAlertAt ?? 1000) && updated.balance >= 0) {
      this.logger.warn(`Low credit balance for user ${userId}: ${updated.balance} remaining`);
    }

    return { ok: true, balance: updated.balance };
  }

  async adminAdjust(userId: string, amount: number, description: string, adminId: string) {
    const newBal = await this.topUp(
      userId, amount, CreditTxType.ADJUSTMENT,
      { description: `[Admin: ${adminId}] ${description}` },
    );
    return { message: `Adjusted ${amount} credits`, balance: newBal.balance };
  }

  async topUp(
    userId: string,
    amount: number,
    type: CreditTxType,
    meta: { description?: string; packageId?: string | null; razorpayPaymentId?: string | null; invoiceId?: string | null },
  ): Promise<CreditBalance> {
    const bal = await this.balModel.findOneAndUpdate(
      { userId },
      { $inc: { balance: amount, lifetimePurchased: amount > 0 ? amount : 0 } },
      { upsert: true, new: true },
    );

    await this.txModel.create({
      userId,
      type,
      amount,
      balanceAfter: bal.balance,
      description: meta.description || '',
      packageId: meta.packageId ?? null,
      razorpayPaymentId: meta.razorpayPaymentId ?? null,
      invoiceId: meta.invoiceId ?? null,
    });

    return bal;
  }

  private async nextInvoiceNumber(): Promise<string> {
    const count = await this.invoiceModel.countDocuments();
    const pad = String(count + 1).padStart(6, '0');
    return `INV-${new Date().getFullYear()}-${pad}`;
  }

  async checkAutoTopUp(userId: string) {
    const bal = await this.balModel.findOne({ userId });
    if (!bal?.autoTopUpEnabled || !bal.autoTopUpPackageId || !bal.autoTopUpThreshold) return;
    if (bal.balance <= bal.autoTopUpThreshold) {
      this.logger.log(`Auto top-up triggered for ${userId}, threshold=${bal.autoTopUpThreshold}`);

    }
  }

  async updateAutoTopUp(userId: string, dto: {
    enabled: boolean; packageId?: string; threshold?: number;
  }) {
    return this.balModel.findOneAndUpdate(
      { userId },
      {
        autoTopUpEnabled: dto.enabled,
        autoTopUpPackageId: dto.packageId ?? null,
        autoTopUpThreshold: dto.threshold ?? null,
      },
      { upsert: true, new: true },
    );
  }

  async submitSalesInquiry(userId: string, dto: {
    businessEmail: string; companyName: string; companyUrl?: string;
    fullName?: string; phone?: string; teamSize?: string;
    useCase?: string; monthlyEvents?: string; packageId?: string;
  }) {

    const existing = await this.salesModel.findOne({
      userId,
      status: SalesInquiryStatus.PENDING,
    });
    if (existing) {
      throw new BadRequestException(
        'You already have a pending inquiry. Our sales team will contact you soon.',
      );
    }

    const inquiry = await this.salesModel.create({
      userId,
      businessEmail: dto.businessEmail,
      companyName: dto.companyName,
      companyUrl: dto.companyUrl || '',
      fullName: dto.fullName || '',
      phone: dto.phone || '',
      teamSize: dto.teamSize || '',
      useCase: dto.useCase || '',
      monthlyEvents: dto.monthlyEvents || '',
      packageId: dto.packageId || null,
      status: SalesInquiryStatus.PENDING,
    });

    this.logger.log(`New sales inquiry from ${dto.businessEmail} (user: ${userId})`);

    await this.auditService.log({
      userId,
      action: AuditAction.BILLING_PAYMENT_ATTEMPT,
      metadata: { type: 'sales_inquiry', inquiryId: inquiry._id, company: dto.companyName },
    });

    return { message: 'Thank you! Our sales team will contact you within 24 hours.', inquiryId: inquiry._id };
  }

  async getMyInquiries(userId: string) {
    return this.salesModel.find({ userId }).sort({ createdAt: -1 }).lean();
  }

  async getAllInquiries(status?: string, limit = 50, skip = 0) {
    const filter: any = {};
    if (status) filter.status = status;
    return this.salesModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  }

  async updateInquiryStatus(inquiryId: string, status: SalesInquiryStatus, adminNotes?: string) {
    const inquiry = await this.salesModel.findByIdAndUpdate(
      inquiryId,
      { status, ...(adminNotes ? { adminNotes } : {}) },
      { new: true },
    );
    if (!inquiry) throw new NotFoundException('Inquiry not found');
    return inquiry;
  }
}
