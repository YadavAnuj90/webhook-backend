import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum EventStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  DEAD = 'dead',
  FILTERED = 'filtered',
  RATE_LIMITED = 'rate_limited',
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
  @Prop({ type: Object, default: null }) lastError: { message: string; statusCode?: number };
  @Prop({ default: null }) deadAt: Date;
}

export const WebhookEventSchema = SchemaFactory.createForClass(WebhookEvent);
WebhookEventSchema.index({ idempotencyKey: 1, endpointId: 1 }, { unique: true });
WebhookEventSchema.index({ status: 1, nextRetryAt: 1 });
WebhookEventSchema.index({ projectId: 1, status: 1, createdAt: -1 });
