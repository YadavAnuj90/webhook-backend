import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, versionKey: false })
export class Reseller extends Document {
  @Prop({ required: true, unique: true }) userId:       string;
  @Prop({ required: true })               companyName:  string;
  @Prop({ type: String, default: null })  logoUrl:      string | null;
  @Prop({ type: String, default: null })  supportEmail: string | null;
  @Prop({ type: String, default: null })  webhookPortalDomain: string | null;

  @Prop({ default: 20 })   defaultMarkupPct:         number;
  @Prop({ default: 100 })  pricePerThousandEvents:   number;
  @Prop({ default: 0 })    totalRevenueCollected:    number;
  @Prop({ default: 0 })    totalCustomers:           number;
  @Prop({ default: true }) isActive: boolean;
}
export const ResellerSchema = SchemaFactory.createForClass(Reseller);

ResellerSchema.index({ isActive: 1 }, { name: 'idx_active' });

@Schema({ timestamps: true, versionKey: false })
export class ResellerCustomer extends Document {
  @Prop({ required: true }) resellerId: string;
  @Prop({ required: true }) customerId: string;
  @Prop({ type: String, default: null }) planId: string | null;
  @Prop({ default: 0 })   markupPct:               number;
  @Prop({ default: 100 }) pricePerThousandEvents:  number;

  @Prop({ default: 0 })                  currentMonthEvents: number;
  @Prop({ type: Date, default: null })   billingCycleStart:  Date | null;
  @Prop({ type: Date, default: null })   billingCycleEnd:    Date | null;

  @Prop({ default: true })               isActive:    boolean;
  @Prop({ type: Date, default: null })   suspendedAt: Date | null;
  @Prop({ type: String, default: null }) notes:       string | null;
}
export const ResellerCustomerSchema = SchemaFactory.createForClass(ResellerCustomer);

ResellerCustomerSchema.index({ resellerId: 1, isActive: 1 }, { name: 'idx_reseller_active' });
ResellerCustomerSchema.index({ customerId: 1 }, { name: 'idx_customer' });
ResellerCustomerSchema.index(
  { resellerId: 1, customerId: 1 },
  { unique: true, name: 'uq_reseller_customer' },
);

ResellerCustomerSchema.index(
  { billingCycleEnd: 1 },
  { sparse: true, name: 'idx_cycle_end' },
);
