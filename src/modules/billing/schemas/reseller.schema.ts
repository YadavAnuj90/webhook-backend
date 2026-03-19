import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ─── Reseller profile ─────────────────────────────────────────────────────────
@Schema({ timestamps: true })
export class Reseller extends Document {
  @Prop({ required: true, unique: true }) userId: string;
  @Prop({ required: true }) companyName: string;
  @Prop({ type: String, default: null }) logoUrl: string;
  @Prop({ type: String, default: null }) supportEmail: string;
  @Prop({ type: String, default: null }) webhookPortalDomain: string;

  @Prop({ default: 20 })  defaultMarkupPct: number;
  @Prop({ default: 100 }) pricePerThousandEvents: number;

  @Prop({ default: 0 })   totalRevenueCollected: number;
  @Prop({ default: 0 })   totalCustomers: number;
  @Prop({ default: true }) isActive: boolean;
}
export const ResellerSchema = SchemaFactory.createForClass(Reseller);

// ─── Reseller ↔ Customer mapping ─────────────────────────────────────────────
@Schema({ timestamps: true })
export class ResellerCustomer extends Document {
  @Prop({ required: true }) resellerId: string;
  @Prop({ required: true }) customerId: string;
  @Prop({ type: String, default: null }) planId: string | null;
  @Prop({ default: 0 })   markupPct: number;
  @Prop({ default: 100 }) pricePerThousandEvents: number;

  @Prop({ default: 0 })                  currentMonthEvents: number;
  @Prop({ type: Date, default: null })   billingCycleStart: Date;
  @Prop({ type: Date, default: null })   billingCycleEnd: Date;

  @Prop({ default: true })               isActive: boolean;
  @Prop({ type: Date,   default: null }) suspendedAt: Date;
  @Prop({ type: String, default: null }) notes: string;
}
export const ResellerCustomerSchema = SchemaFactory.createForClass(ResellerCustomer);
ResellerCustomerSchema.index({ resellerId: 1 });
ResellerCustomerSchema.index({ customerId: 1 });
ResellerCustomerSchema.index({ resellerId: 1, customerId: 1 }, { unique: true });
