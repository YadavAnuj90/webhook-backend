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

/**
 * Subscription — checked on every authenticated API request (via SubscriptionGuard).
 *
 * DBA decisions:
 * - userId unique: one subscription per user, O(1) findOne by userId
 * - versionKey:false
 * - Compound indexes for scheduled jobs:
 *     trial expiry job   → { status:'trial', trialEndAt }
 *     renewal job        → { status:'active', currentPeriodEnd }
 * - Status field updated atomically with period dates in one findOneAndUpdate
 */
@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class Subscription extends Document {
  @Prop({ required: true, unique: true }) userId:   string;
  @Prop({ required: true })              planId:   string;
  @Prop({ required: true })              planName: string;

  @Prop({ default: SubscriptionStatus.TRIAL, enum: SubscriptionStatus }) status: SubscriptionStatus;

  @Prop({ type: Date, default: null }) trialStartAt:        Date | null;
  @Prop({ type: Date, default: null }) trialEndAt:          Date | null;
  @Prop({ type: Date, default: null }) currentPeriodStart:  Date | null;
  @Prop({ type: Date, default: null }) currentPeriodEnd:    Date | null;

  @Prop({ type: String, default: null }) razorpaySubscriptionId: string | null;
  @Prop({ type: String, default: null }) razorpayCustomerId:     string | null;
  @Prop({ type: String, default: null }) razorpayPlanId:         string | null;
  @Prop({ type: String, default: null }) lastPaymentId:          string | null;
  @Prop({ type: Date,   default: null }) lastPaymentAt:          Date | null;

  @Prop({ type: Date,   default: null }) cancelledAt:  Date | null;
  @Prop({ type: String, default: null }) cancelReason: string | null;

  @Prop({ type: String, default: null }) resellerId:          string | null;
  @Prop({ default: 0 })                  resellerMarkupPct:   number;

  @Prop({ default: true }) autoRenew: boolean;

  // Quota snapshot — denormalised from Plan for fast access
  @Prop({ default: 5000 }) eventsPerMonth: number;
  @Prop({ default: 3 })    endpointsLimit: number;
  @Prop({ default: 7 })    retentionDays:  number;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

// Primary lookup: one row per user
SubscriptionSchema.index({ userId: 1 }, { unique: true, name: 'uq_user' });

// SubscriptionGuard fast-path: userId + status in one covered read
SubscriptionSchema.index({ userId: 1, status: 1 }, { name: 'idx_user_status' });

// Trial expiry cron job
SubscriptionSchema.index(
  { status: 1, trialEndAt: 1 },
  { partialFilterExpression: { status: 'trial' }, name: 'idx_trial_expiry_partial' },
);

// Renewal / dunning cron job
SubscriptionSchema.index(
  { status: 1, currentPeriodEnd: 1 },
  { partialFilterExpression: { status: 'active' }, name: 'idx_renewal_partial' },
);

// Reseller dashboard
SubscriptionSchema.index({ resellerId: 1 }, { sparse: true, name: 'idx_reseller' });
