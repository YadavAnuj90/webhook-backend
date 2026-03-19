import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum SubscriptionStatus {
  TRIAL         = 'trial',
  TRIAL_EXPIRED = 'trial_expired',
  ACTIVE        = 'active',
  PAST_DUE      = 'past_due',
  CANCELLED     = 'cancelled',
  SUSPENDED     = 'suspended',
  CREDIT_ONLY   = 'credit_only',
}

@Schema({ timestamps: true })
export class Subscription extends Document {
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) planId: string;
  @Prop({ required: true }) planName: string;

  @Prop({ default: SubscriptionStatus.TRIAL, enum: SubscriptionStatus })
  status: SubscriptionStatus;

  // Trial window
  @Prop({ type: Date, default: null }) trialStartAt: Date;
  @Prop({ type: Date, default: null }) trialEndAt: Date;

  // Paid subscription window
  @Prop({ type: Date, default: null }) currentPeriodStart: Date;
  @Prop({ type: Date, default: null }) currentPeriodEnd: Date;

  // Razorpay
  @Prop({ type: String, default: null }) razorpaySubscriptionId: string;
  @Prop({ type: String, default: null }) razorpayCustomerId: string;
  @Prop({ type: String, default: null }) razorpayPlanId: string;
  @Prop({ type: String, default: null }) lastPaymentId: string;
  @Prop({ type: Date,   default: null }) lastPaymentAt: Date;

  // Cancellation
  @Prop({ type: Date,   default: null }) cancelledAt: Date;
  @Prop({ type: String, default: null }) cancelReason: string;

  // Reseller
  @Prop({ type: String, default: null }) resellerId: string | null;
  @Prop({ default: 0 }) resellerMarkupPct: number;

  @Prop({ default: true }) autoRenew: boolean;

  // Quotas snapshot
  @Prop({ default: 5000 }) eventsPerMonth: number;
  @Prop({ default: 3 })    endpointsLimit: number;
  @Prop({ default: 7 })    retentionDays: number;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
SubscriptionSchema.index({ userId: 1 }, { unique: true });
SubscriptionSchema.index({ status: 1 });
SubscriptionSchema.index({ resellerId: 1 });
SubscriptionSchema.index({ trialEndAt: 1 });
SubscriptionSchema.index({ currentPeriodEnd: 1 });
