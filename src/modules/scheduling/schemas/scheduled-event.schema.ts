import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ScheduledEventStatus {
  PENDING   = 'pending',    // waiting for scheduled time
  QUEUED    = 'queued',     // dispatched to delivery queue
  DELIVERED = 'delivered',  // successfully delivered
  CANCELLED = 'cancelled',  // cancelled before delivery
  FAILED    = 'failed',     // delivery failed after dispatch
  EXPIRED   = 'expired',    // TTL exceeded before delivery
}

/**
 * ScheduledEvent — delayed webhook delivery.
 *
 * DBA decisions:
 * - Separate collection from WebhookEvent to avoid polluting the hot-path worker poll index
 * - Cron-based dispatch: every 30s scan for events due
 * - Once dispatched, creates a normal WebhookEvent and follows standard delivery pipeline
 * - Soft-cancel: status → cancelled (no hard delete)
 * - TTL: 30 days after scheduledFor for cleanup
 */
@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class ScheduledEvent extends Document {
  @Prop({ required: true }) projectId:  string;
  @Prop({ required: true }) endpointId: string;
  @Prop({ required: true }) eventType:  string;

  @Prop({ type: Object, required: true }) payload: Record<string, any>;

  @Prop({ required: true, type: Date }) scheduledFor: Date;

  @Prop({
    default: ScheduledEventStatus.PENDING,
    enum: ScheduledEventStatus,
  })
  status: ScheduledEventStatus;

  @Prop({ default: 'p2', enum: ['p0', 'p1', 'p2', 'p3'] }) priority: string;

  @Prop({ type: String, default: null }) idempotencyKey: string | null;

  /** Reference to the WebhookEvent created upon dispatch */
  @Prop({ type: String, default: null }) dispatchedEventId: string | null;

  @Prop({ type: Date, default: null }) dispatchedAt:  Date | null;
  @Prop({ type: Date, default: null }) cancelledAt:   Date | null;
  @Prop({ type: String, default: null }) cancelReason: string | null;

  /** Who scheduled this — userId for audit trail */
  @Prop({ required: true }) createdBy: string;
}

export const ScheduledEventSchema = SchemaFactory.createForClass(ScheduledEvent);

// ── Dispatch worker poll (most critical — cron hits this every 30s) ──────────
ScheduledEventSchema.index(
  { status: 1, scheduledFor: 1 },
  { name: 'idx_dispatch_poll' },
);

// ── Project list (dashboard/API) ────────────────────────────────────────────
ScheduledEventSchema.index(
  { projectId: 1, status: 1, scheduledFor: -1 },
  { name: 'idx_project_status_scheduled' },
);

// ── Idempotency (prevent duplicate schedules) ────────────────────────────────
ScheduledEventSchema.index(
  { projectId: 1, endpointId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true, name: 'uq_schedule_idempotency' },
);

// ── TTL: auto-cleanup 30 days after scheduled delivery time ─────────────────
ScheduledEventSchema.index(
  { scheduledFor: 1 },
  { expireAfterSeconds: 30 * 24 * 3600, name: 'ttl_scheduled_cleanup' },
);
