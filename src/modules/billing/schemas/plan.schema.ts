import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum PlanInterval {
  MONTHLY = 'monthly',
  YEARLY  = 'yearly',
}

export enum PlanType {
  SYSTEM   = 'system',
  RESELLER = 'reseller',
}

@Schema({ timestamps: true })
export class Plan extends Document {
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) description: string;

  @Prop({ default: PlanType.SYSTEM, enum: PlanType }) type: PlanType;

  // null = system plan; resellerId = custom plan by that reseller
  @Prop({ type: String, default: null }) resellerId: string | null;

  // pricing
  @Prop({ default: 0 }) priceMonthly: number;
  @Prop({ default: 0 }) priceYearly: number;
  @Prop({ default: 'INR' }) currency: string;
  @Prop({ default: PlanInterval.MONTHLY, enum: PlanInterval }) interval: PlanInterval;

  // quotas  (-1 = unlimited)
  @Prop({ default: 5_000 }) eventsPerMonth: number;
  @Prop({ default: 3 })     endpointsLimit: number;
  @Prop({ default: 7 })     retentionDays: number;
  @Prop({ default: 1 })     projectsLimit: number;
  @Prop({ default: 2 })     teamMembersLimit: number;

  // feature flags
  @Prop({ default: false }) analyticsEnabled: boolean;
  @Prop({ default: false }) customDomainsEnabled: boolean;
  @Prop({ default: false }) slaMonitoringEnabled: boolean;
  @Prop({ default: false }) aiEnabled: boolean;
  @Prop({ default: false }) resellerEnabled: boolean;
  @Prop({ default: false }) priorityQueueEnabled: boolean;
  @Prop({ default: false }) mtlsEnabled: boolean;
  @Prop({ default: false }) eventCatalogEnabled: boolean;

  @Prop({ default: 10 }) trialDays: number;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: 1 }) sortOrder: number;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
PlanSchema.index({ type: 1, resellerId: 1 });
