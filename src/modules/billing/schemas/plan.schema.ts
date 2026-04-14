import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum PlanInterval { MONTHLY = 'monthly', YEARLY = 'yearly' }
export enum PlanType     { SYSTEM = 'system', RESELLER = 'reseller' }

@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class Plan extends Document {
  @Prop({ required: true }) name:        string;
  @Prop({ default: '' })    description: string;
  @Prop({ default: PlanType.SYSTEM, enum: PlanType }) type: PlanType;
  @Prop({ type: String, default: null }) resellerId: string | null;

  @Prop({ default: 0 })    priceMonthly: number;
  @Prop({ default: 0 })    priceYearly:  number;
  @Prop({ default: 'INR' }) currency:    string;
  @Prop({ default: PlanInterval.MONTHLY, enum: PlanInterval }) interval: PlanInterval;

  @Prop({ default: 5_000 }) eventsPerMonth:    number;
  @Prop({ default: 3 })     endpointsLimit:    number;
  @Prop({ default: 7 })     retentionDays:     number;
  @Prop({ default: 1 })     projectsLimit:     number;
  @Prop({ default: 2 })     teamMembersLimit:  number;

  @Prop({ default: false }) analyticsEnabled:    boolean;
  @Prop({ default: false }) customDomainsEnabled: boolean;
  @Prop({ default: false }) slaMonitoringEnabled: boolean;
  @Prop({ default: false }) aiEnabled:            boolean;
  @Prop({ default: false }) resellerEnabled:      boolean;
  @Prop({ default: false }) priorityQueueEnabled: boolean;
  @Prop({ default: false }) mtlsEnabled:          boolean;
  @Prop({ default: false }) eventCatalogEnabled:  boolean;

  @Prop({ default: 10 })   trialDays: number;
  @Prop({ default: true }) isActive:  boolean;
  @Prop({ default: 1 })    sortOrder: number;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);

PlanSchema.index({ type: 1, resellerId: 1, isActive: 1 }, { name: 'idx_type_reseller_active' });

PlanSchema.index({ isActive: 1, sortOrder: 1 }, { name: 'idx_active_sort' });
