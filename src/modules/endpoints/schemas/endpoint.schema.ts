import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum EndpointStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  DISABLED = 'disabled',
}

export interface FilterRule {
  field: string;       // e.g. "payload.amount"
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists';
  value?: any;
}

export interface RateLimitConfig {
  maxPerMinute: number;   // max deliveries per minute
  maxPerHour: number;     // max deliveries per hour
  maxPerDay: number;      // max deliveries per day
}

@Schema({ timestamps: true })
export class Endpoint extends Document {
  @Prop({ required: true })
  projectId: string; // multi-tenant isolation

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  secret: string;

  @Prop({ default: EndpointStatus.ACTIVE, enum: EndpointStatus })
  status: EndpointStatus;

  @Prop({ type: [String], default: [] })
  eventTypes: string[];

  @Prop({ type: [String], default: [] })
  allowedIps: string[];

  @Prop({ type: Object, default: {} })
  headers: Record<string, string>;

  @Prop({ default: 30000 })
  timeoutMs: number;

  // ─── Rate Limiting ─────────────────────────────────────────────────────────
  @Prop({
    type: Object,
    default: { maxPerMinute: 60, maxPerHour: 1000, maxPerDay: 10000 },
  })
  rateLimit: RateLimitConfig;

  // ─── Filter Rules ──────────────────────────────────────────────────────────
  // Only deliver if ALL rules match
  @Prop({ type: [Object], default: [] })
  filterRules: FilterRule[];

  // ─── Health tracking ───────────────────────────────────────────────────────
  @Prop({ default: 0 })
  failureCount: number;

  @Prop({ default: null })
  lastFailureAt: Date;

  @Prop({ default: null })
  lastSuccessAt: Date;

  // ─── Stats counters ────────────────────────────────────────────────────────
  @Prop({ default: 0 })
  totalDelivered: number;

  @Prop({ default: 0 })
  totalFailed: number;

  // ─── Rate limit counters (reset periodically) ──────────────────────────────
  @Prop({ default: 0 }) deliveriesThisMinute: number;
  @Prop({ default: 0 }) deliveriesThisHour: number;
  @Prop({ default: 0 }) deliveriesThisDay: number;
  @Prop({ default: null }) minuteResetAt: Date;
  @Prop({ default: null }) hourResetAt: Date;
  @Prop({ default: null }) dayResetAt: Date;
}

export const EndpointSchema = SchemaFactory.createForClass(Endpoint);
EndpointSchema.index({ projectId: 1, status: 1 });
