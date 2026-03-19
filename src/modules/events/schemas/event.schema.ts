import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum EventStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  DEAD = 'dead',
  FILTERED = 'filtered',
  RATE_LIMITED = 'rate_limited',
  RETRYING = 'retrying',
}

@Schema({ timestamps: true })
export class WebhookEvent extends Document {
  @Prop({ required: true }) projectId: string;
  @Prop({ required: true }) endpointId: string;
  @Prop({ required: true }) eventType: string;
  @Prop({ type: Object, required: true }) payload: Record<string, any>;
  @Prop({ required: true, unique: false }) idempotencyKey: string;
  @Prop({ default: EventStatus.PENDING, enum: EventStatus }) status: EventStatus;
  @Prop({ default: 0 }) retryCount: number;
  @Prop({ default: null }) nextRetryAt: Date;
  @Prop({ default: null }) lastAttemptAt: Date;
  @Prop({ default: null }) deliveredAt: Date;
  @Prop({ default: null }) deadAt: Date;

  // FEATURE 1: Priority per event (p0-p3)
  @Prop({ default: 'p2', enum: ['p0', 'p1', 'p2', 'p3'] }) priority: string;

  // FEATURE 17: Event TTL / Auto-Expiry
  @Prop({ default: null }) expiresAt: Date;

  // Last delivery attempt summary — written by DeliveryService on every attempt
  @Prop({
    type: Object,
    default: null,
  })
  lastResponse: {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
    durationMs: number;
  } | null;

  // Legacy error field kept for backwards compat
  @Prop({ type: Object, default: null }) lastError: { message: string; statusCode?: number };
}

export const WebhookEventSchema = SchemaFactory.createForClass(WebhookEvent);
WebhookEventSchema.index({ idempotencyKey: 1, endpointId: 1 }, { unique: true });
WebhookEventSchema.index({ status: 1, nextRetryAt: 1 });
WebhookEventSchema.index({ projectId: 1, status: 1, createdAt: -1 });
WebhookEventSchema.index({ projectId: 1, endpointId: 1, createdAt: -1 });
