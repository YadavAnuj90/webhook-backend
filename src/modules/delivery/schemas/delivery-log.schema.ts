import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * DeliveryLog — append-only, very high write volume.
 *
 * DBA decisions:
 * - versionKey:false + timestamps:false → pure insert, zero extra fields
 * - Unique on { eventId, attempt } — prevents duplicate log rows
 * - Partial index on success:false — only failures are indexed for DLQ queries
 * - TTL: auto-delete after 90 days
 * - Atomic pattern: insert only, never update
 */
@Schema({
  timestamps: false,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class DeliveryLog extends Document {
  @Prop({ required: true }) eventId:    string;
  @Prop({ required: true }) endpointId: string;
  @Prop({ required: true }) projectId:  string;
  @Prop({ required: true }) attempt:    number;
  @Prop({ required: true }) success:    boolean;
  @Prop() statusCode:    number;
  @Prop() responseBody:  string;
  @Prop({ type: Object, default: null }) responseHeaders: Record<string, string> | null;
  @Prop({ default: 0 }) latencyMs:    number;
  @Prop() errorMessage:  string;
  @Prop({ required: true, default: () => new Date() }) attemptedAt: Date;
  @Prop({ default: false }) isCanary: boolean;
}

export const DeliveryLogSchema = SchemaFactory.createForClass(DeliveryLog);

// ── Unique per (event, attempt) ───────────────────────────────────────────────
DeliveryLogSchema.index(
  { eventId: 1, attempt: 1 },
  { unique: true, name: 'uq_event_attempt' },
);

// ── Endpoint health dashboard ─────────────────────────────────────────────────
DeliveryLogSchema.index(
  { endpointId: 1, success: 1, attemptedAt: -1 },
  { name: 'idx_endpoint_success_time' },
);

// ── Project-level analytics ───────────────────────────────────────────────────
DeliveryLogSchema.index(
  { projectId: 1, success: 1, attemptedAt: -1 },
  { name: 'idx_project_success_time' },
);

// ── Latency percentile queries ────────────────────────────────────────────────
DeliveryLogSchema.index(
  { endpointId: 1, attemptedAt: -1 },
  { name: 'idx_endpoint_time' },
);

// ── Partial index: failures only (smaller index, DLQ triage) ─────────────────
DeliveryLogSchema.index(
  { projectId: 1, attemptedAt: -1 },
  {
    partialFilterExpression: { success: false },
    name: 'idx_project_failures_partial',
  },
);

// ── TTL: auto-delete logs older than 90 days ─────────────────────────────────
DeliveryLogSchema.index(
  { attemptedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 3600, name: 'ttl_delivery_log' },
);
