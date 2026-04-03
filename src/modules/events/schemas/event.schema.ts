import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum EventStatus {
  PENDING      = 'pending',
  DELIVERED    = 'delivered',
  FAILED       = 'failed',
  DEAD         = 'dead',
  FILTERED     = 'filtered',
  RATE_LIMITED = 'rate_limited',
  RETRYING     = 'retrying',
}

/**
 * WebhookEvent — highest-traffic collection in the system.
 *
 * DBA decisions:
 * - versionKey:false  → no __v field, saves one write field per update
 * - Compound indexes tuned to three main access patterns:
 *     1. Worker poll  : { status, nextRetryAt, priority }
 *     2. Project list : { projectId, status, createdAt }
 *     3. Endpoint list: { endpointId, status, createdAt }
 * - Idempotency unique index keeps duplicate suppression O(1)
 * - TTL index on expiresAt auto-purges expired events — no cron needed
 * - retryCount/status updated atomically via $inc/$set in one findOneAndUpdate
 */
@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class WebhookEvent extends Document {
  @Prop({ required: true }) projectId:  string;
  @Prop({ required: true }) endpointId: string;
  @Prop({ required: true }) eventType:  string;

  @Prop({ type: Object, required: true }) payload: Record<string, any>;

  @Prop({ required: true }) idempotencyKey: string;

  @Prop({ default: EventStatus.PENDING, enum: EventStatus }) status: EventStatus;

  // ── Retry tracking — use $inc for atomic increment ────────────────────────
  @Prop({ default: 0 }) retryCount:     number;
  @Prop({ type: Date, default: null })  nextRetryAt:   Date | null;
  @Prop({ type: Date, default: null })  lastAttemptAt: Date | null;
  @Prop({ type: Date, default: null })  deliveredAt:   Date | null;
  @Prop({ type: Date, default: null })  deadAt:        Date | null;

  // p0 = highest priority, p3 = lowest
  @Prop({ default: 'p2', enum: ['p0', 'p1', 'p2', 'p3'] }) priority: string;

  // TTL — MongoDB deletes the doc when expiresAt is reached
  @Prop({ type: Date, default: null }) expiresAt: Date | null;

  // Written atomically alongside status update
  @Prop({ type: Object, default: null })
  lastResponse: {
    statusCode: number;
    body:       string;
    headers:    Record<string, string>;
    durationMs: number;
  } | null;

  @Prop({ type: Object, default: null })
  lastError: { message: string; statusCode?: number } | null;
}

export const WebhookEventSchema = SchemaFactory.createForClass(WebhookEvent);

// ── Uniqueness ────────────────────────────────────────────────────────────────
WebhookEventSchema.index(
  { idempotencyKey: 1, endpointId: 1 },
  { unique: true, name: 'uq_idempotency_endpoint' },
);

// ── Worker poll (most critical — delivery workers hit this every second) ───────
// Covers: { status: 'pending', nextRetryAt: {$lte: now} } sort by priority
WebhookEventSchema.index(
  { status: 1, nextRetryAt: 1, priority: 1 },
  { name: 'idx_worker_poll' },
);

// ── Dashboard / API list queries ──────────────────────────────────────────────
WebhookEventSchema.index(
  { projectId: 1, status: 1, createdAt: -1 },
  { name: 'idx_project_status_time' },
);
WebhookEventSchema.index(
  { projectId: 1, endpointId: 1, createdAt: -1 },
  { name: 'idx_project_endpoint_time' },
);
WebhookEventSchema.index(
  { projectId: 1, eventType: 1, createdAt: -1 },
  { name: 'idx_project_eventtype_time' },
);

// ── DLQ: dead events ordered by time ─────────────────────────────────────────
WebhookEventSchema.index(
  { projectId: 1, deadAt: -1 },
  { sparse: true, name: 'idx_project_dead' },
);

// ── TTL: auto-delete events past their expiry date ───────────────────────────
WebhookEventSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, sparse: true, name: 'ttl_event_expiry' },
);
