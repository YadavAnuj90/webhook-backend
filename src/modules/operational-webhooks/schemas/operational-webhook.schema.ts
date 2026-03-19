import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum OperationalEvent {
  ENDPOINT_DISABLED   = 'endpoint.disabled',
  ENDPOINT_RECOVERED  = 'endpoint.recovered',
  DLQ_EVENT_ADDED     = 'dlq.event_added',
  DLQ_THRESHOLD       = 'dlq.threshold_exceeded',
  CIRCUIT_OPENED      = 'circuit.opened',
  CIRCUIT_CLOSED      = 'circuit.closed',
  DELIVERY_FAILURE    = 'delivery.failure_streak',
  BILLING_LIMIT       = 'billing.limit_reached',
  BILLING_OVERAGE     = 'billing.overage',
  SLA_BREACH          = 'sla.breach',
}

@Schema({ timestamps: true })
export class OperationalWebhook extends Document {
  @Prop({ required: true }) projectId: string;
  @Prop({ required: true }) url: string;
  @Prop({ required: true }) secret: string;
  @Prop({
    type: [String],
    default: Object.values(OperationalEvent),
    enum: Object.values(OperationalEvent),
  })
  events: string[];
  @Prop({ default: true }) isActive: boolean;
  @Prop({ trim: true }) description: string;
  @Prop({ default: null }) lastFiredAt: Date;
  @Prop({ default: 0 }) totalFired: number;
}

export const OperationalWebhookSchema = SchemaFactory.createForClass(OperationalWebhook);
OperationalWebhookSchema.index({ projectId: 1, isActive: 1 });
