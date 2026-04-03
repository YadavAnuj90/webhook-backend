import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ─── Credit Package ───────────────────────────────────────────────────────────
@Schema({ timestamps: true, versionKey: false })
export class CreditPackage extends Document {
  @Prop({ required: true }) name:         string;
  @Prop({ required: true }) credits:      number;
  @Prop({ required: true }) price:        number;
  @Prop({ default: 'INR' }) currency:     string;
  @Prop({ default: '' })    description:  string;
  @Prop({ default: true })  isActive:     boolean;
  @Prop({ default: 0 })     bonusCredits: number;
  @Prop({ default: 1 })     sortOrder:    number;
}
export const CreditPackageSchema = SchemaFactory.createForClass(CreditPackage);
CreditPackageSchema.index({ isActive: 1, sortOrder: 1 }, { name: 'idx_active_sort' });

// ─── Credit Balance ───────────────────────────────────────────────────────────
/**
 * DBA: balance is updated atomically via $inc — never read-modify-write.
 *   await CreditBalance.findOneAndUpdate(
 *     { userId },
 *     { $inc: { balance: -amount, lifetimeUsed: amount } },
 *     { new: true, upsert: true }
 *   );
 * lowBalanceAlertAt threshold checked in app after $inc resolves.
 */
@Schema({ timestamps: true, versionKey: false })
export class CreditBalance extends Document {
  @Prop({ required: true, unique: true }) userId:            string;
  @Prop({ default: 0 })                  balance:           number;  // $inc atomically
  @Prop({ default: 0 })                  lifetimePurchased: number;
  @Prop({ default: 0 })                  lifetimeUsed:      number;
  @Prop({ default: 0 })                  lifetimeExpired:   number;
  @Prop({ type: Number, default: null }) lowBalanceAlertAt: number | null;
  @Prop({ default: false })              autoTopUpEnabled:  boolean;
  @Prop({ type: String, default: null }) autoTopUpPackageId: string | null;
  @Prop({ type: Number, default: null }) autoTopUpThreshold: number | null;
}
export const CreditBalanceSchema = SchemaFactory.createForClass(CreditBalance);
// userId unique from @Prop
// Low-balance alerts: find users near zero
CreditBalanceSchema.index(
  { balance: 1 },
  { partialFilterExpression: { autoTopUpEnabled: true }, name: 'idx_autotopup_partial' },
);

// ─── Credit Transaction ───────────────────────────────────────────────────────
export enum CreditTxType {
  PURCHASE   = 'purchase',
  USAGE      = 'usage',
  REFUND     = 'refund',
  ADJUSTMENT = 'adjustment',
  BONUS      = 'bonus',
  EXPIRY     = 'expiry',
}

/**
 * CreditTransaction — append-only ledger.
 * Never update rows; only insert. Balance is derived from CreditBalance doc.
 */
@Schema({ timestamps: true, versionKey: false })
export class CreditTransaction extends Document {
  @Prop({ required: true })              userId:          string;
  @Prop({ required: true, enum: CreditTxType }) type:    CreditTxType;
  @Prop({ required: true })              amount:          number;
  @Prop({ default: 0 })                  balanceAfter:    number;
  @Prop({ type: String, default: null }) description:     string | null;
  @Prop({ type: String, default: null }) invoiceId:       string | null;
  @Prop({ type: String, default: null }) packageId:       string | null;
  @Prop({ type: String, default: null }) deliveryLogId:   string | null;
  @Prop({ type: String, default: null }) razorpayPaymentId: string | null;
  @Prop({ type: String, default: null }) projectId:       string | null;
  @Prop({ type: String, default: null }) endpointId:      string | null;
}
export const CreditTransactionSchema = SchemaFactory.createForClass(CreditTransaction);

// User transaction history (billing page)
CreditTransactionSchema.index({ userId: 1, createdAt: -1 }, { name: 'idx_user_time' });

// Filter by type within user (e.g. show only purchases)
CreditTransactionSchema.index({ userId: 1, type: 1, createdAt: -1 }, { name: 'idx_user_type_time' });

// Idempotency on Razorpay payment — prevent double-credit on retry
CreditTransactionSchema.index(
  { razorpayPaymentId: 1 },
  { sparse: true, unique: true, name: 'uq_razorpay_payment' },
);
