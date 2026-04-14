import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ScheduledEventStatus {
  PENDING   = 'pending',
  QUEUED    = 'queued',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  FAILED    = 'failed',
  EXPIRED   = 'expired',
}

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

  @Prop({ type: String, default: null }) dispatchedEventId: string | null;

  @Prop({ type: Date, default: null }) dispatchedAt:  Date | null;
  @Prop({ type: Date, default: null }) cancelledAt:   Date | null;
  @Prop({ type: String, default: null }) cancelReason: string | null;

  @Prop({ required: true }) createdBy: string;
}

export const ScheduledEventSchema = SchemaFactory.createForClass(ScheduledEvent);

ScheduledEventSchema.index(
  { status: 1, scheduledFor: 1 },
  { name: 'idx_dispatch_poll' },
);

ScheduledEventSchema.index(
  { projectId: 1, status: 1, scheduledFor: -1 },
  { name: 'idx_project_status_scheduled' },
);

ScheduledEventSchema.index(
  { projectId: 1, endpointId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true, name: 'uq_schedule_idempotency' },
);

ScheduledEventSchema.index(
  { scheduledFor: 1 },
  { expireAfterSeconds: 30 * 24 * 3600, name: 'ttl_scheduled_cleanup' },
);
