import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum EventStatus {
  PENDING        = 'pending',
  DELIVERED      = 'delivered',
  FAILED         = 'failed',
  DEAD           = 'dead',
  FILTERED       = 'filtered',
  RATE_LIMITED   = 'rate_limited',
  RATE_QUEUED    = 'rate_queued',
  RETRYING       = 'retrying',
  SCHEDULED      = 'scheduled',
}

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

  @Prop({ type: String, default: null }) requestId: string | null;

  @Prop({ default: EventStatus.PENDING, enum: EventStatus }) status: EventStatus;

  @Prop({ default: 0 }) retryCount:     number;
  @Prop({ type: Date, default: null })  nextRetryAt:   Date | null;
  @Prop({ type: Date, default: null })  lastAttemptAt: Date | null;
  @Prop({ type: Date, default: null })  deliveredAt:   Date | null;
  @Prop({ type: Date, default: null })  deadAt:        Date | null;

  @Prop({ default: 'p2', enum: ['p0', 'p1', 'p2', 'p3'] }) priority: string;

  @Prop({ type: Date, default: null }) expiresAt: Date | null;

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

WebhookEventSchema.index(
  { idempotencyKey: 1, endpointId: 1 },
  { unique: true, name: 'uq_idempotency_endpoint' },
);

WebhookEventSchema.index(
  { status: 1, nextRetryAt: 1, priority: 1 },
  { name: 'idx_worker_poll' },
);

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

WebhookEventSchema.index(
  { projectId: 1, deadAt: -1 },
  { sparse: true, name: 'idx_project_dead' },
);

WebhookEventSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, sparse: true, name: 'ttl_event_expiry' },
);
