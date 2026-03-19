import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ─── Credit Package ───────────────────────────────────────────────────────────
@Schema({ timestamps: true })
export class CreditPackage extends Document {
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) credits: number;
  @Prop({ required: true }) price: number;
  @Prop({ default: 'INR' }) currency: string;
  @Prop({ default: '' })    description: string;
  @Prop({ default: true })  isActive: boolean;
  @Prop({ default: 0 })     bonusCredits: number;
  @Prop({ default: 1 })     sortOrder: number;
}
export const CreditPackageSchema = SchemaFactory.createForClass(CreditPackage);

// ─── Credit Balance ───────────────────────────────────────────────────────────
@Schema({ timestamps: true })
export class CreditBalance extends Document {
  @Prop({ required: true, unique: true }) userId: string;
  @Prop({ default: 0 }) balance: number;
  @Prop({ default: 0 }) lifetimePurchased: number;
  @Prop({ default: 0 }) lifetimeUsed: number;
  @Prop({ default: 0 }) lifetimeExpired: number;
  @Prop({ type: Number, default: null }) lowBalanceAlertAt: number | null;
  @Prop({ default: false }) autoTopUpEnabled: boolean;
  @Prop({ type: String, default: null }) autoTopUpPackageId: string | null;
  @Prop({ type: Number, default: null }) autoTopUpThreshold: number | null;
}
export const CreditBalanceSchema = SchemaFactory.createForClass(CreditBalance);

// ─── Credit Transaction ───────────────────────────────────────────────────────
export enum CreditTxType {
  PURCHASE   = 'purchase',
  USAGE      = 'usage',
  REFUND     = 'refund',
  ADJUSTMENT = 'adjustment',
  BONUS      = 'bonus',
  EXPIRY     = 'expiry',
}

@Schema({ timestamps: true })
export class CreditTransaction extends Document {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true, enum: CreditTxType }) type: CreditTxType;
  @Prop({ required: true }) amount: number;
  @Prop({ default: 0 })     balanceAfter: number;
  @Prop({ type: String, default: null }) description: string;

  @Prop({ type: String, default: null }) invoiceId: string | null;
  @Prop({ type: String, default: null }) packageId: string | null;
  @Prop({ type: String, default: null }) deliveryLogId: string | null;
  @Prop({ type: String, default: null }) razorpayPaymentId: string | null;

  @Prop({ type: String, default: null }) projectId: string | null;
  @Prop({ type: String, default: null }) endpointId: string | null;
}
export const CreditTransactionSchema = SchemaFactory.createForClass(CreditTransaction);
CreditTransactionSchema.index({ userId: 1, createdAt: -1 });
CreditTransactionSchema.index({ type: 1 });
