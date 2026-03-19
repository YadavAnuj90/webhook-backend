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
} from './schemas/credit-ledger.schema';
import { Invoice, InvoiceType, InvoiceStatus } from './schemas/invoice.schema';
import { Subscription, SubscriptionStatus } from './schemas/subscription.schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Razorpay = require('razorpay');

/** Credits consumed per delivery event */
export const CREDITS_PER_DELIVERY = 1;
/** Credits consumed per retry attempt */
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
    private config: ConfigService,
    private auditService: AuditService,
  ) {
    this.razorpay = new Razorpay({
      key_id: config.get('RAZORPAY_KEY_ID'),
      key_secret: config.get('RAZORPAY_KEY_SECRET') || '',
    });
  }

  // ─── Credit Packages ────────────────────────────────────────────────────────

  async getPackages() {
    return this.pkgModel.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  }

  async seedDefaultPackages() {
    const count = await this.pkgModel.countDocuments();
    if (count > 0) return;
    await this.pkgModel.insertMany([
      { name: 'Micro Pack',    credits: 10_000,   bonusCredits: 0,       price: 49900,   description: '10K delivery credits',           sortOrder: 1 },
      { name: 'Starter Pack',  credits: 50_000,   bonusCredits: 2_500,   price: 199900,  description: '50K + 2.5K bonus credits',       sortOrder: 2 },
      { name: 'Growth Pack',   credits: 200_000,  bonusCredits: 20_000,  price: 699900,  description: '200K + 20K bonus credits',       sortOrder: 3 },
      { name: 'Business Pack', credits: 1_000_000,bonusCredits: 150_000, price: 2999900, description: '1M + 150K bonus credits',        sortOrder: 4 },
      { name: 'Enterprise Pack',credits: 5_000_000,bonusCredits: 1_000_000,price:12999900,description: '5M + 1M bonus credits',         sortOrder: 5 },
    ]);
    this.logger.log('Seeded default credit packages');
  }

  // ─── Balance ────────────────────────────────────────────────────────────────

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

  // ─── Purchase flow ──────────────────────────────────────────────────────────

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

    // Generate invoice
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

    // If user was on TRIAL_EXPIRED, upgrade to CREDIT_ONLY status
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

  // ─── Deduct credits (called by DeliveryService) ──────────────────────────────

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

    // Low balance alert
    if (updated.balance <= (updated.lowBalanceAlertAt ?? 1000) && updated.balance >= 0) {
      this.logger.warn(`Low credit balance for user ${userId}: ${updated.balance} remaining`);
    }

    return { ok: true, balance: updated.balance };
  }

  // ─── Admin/manual top-up ─────────────────────────────────────────────────────

  async adminAdjust(userId: string, amount: number, description: string, adminId: string) {
    const newBal = await this.topUp(
      userId, amount, CreditTxType.ADJUSTMENT,
      { description: `[Admin: ${adminId}] ${description}` },
    );
    return { message: `Adjusted ${amount} credits`, balance: newBal.balance };
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

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

  // ─── Auto top-up check ───────────────────────────────────────────────────────
  async checkAutoTopUp(userId: string) {
    const bal = await this.balModel.findOne({ userId });
    if (!bal?.autoTopUpEnabled || !bal.autoTopUpPackageId || !bal.autoTopUpThreshold) return;
    if (bal.balance <= bal.autoTopUpThreshold) {
      this.logger.log(`Auto top-up triggered for ${userId}, threshold=${bal.autoTopUpThreshold}`);
      // In production, this would trigger a Razorpay auto-charge via saved card
      // For now we log the intent — integration point for saved payment methods
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
}
