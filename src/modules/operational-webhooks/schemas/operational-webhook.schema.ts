import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum OperationalEvent {
  ENDPOINT_DISABLED  = 'endpoint.disabled',
  ENDPOINT_RECOVERED = 'endpoint.recovered',
  DLQ_EVENT_ADDED    = 'dlq.event_added',
  DLQ_THRESHOLD      = 'dlq.threshold_exceeded',
  CIRCUIT_OPENED     = 'circuit.opened',
  CIRCUIT_CLOSED     = 'circuit.closed',
  DELIVERY_FAILURE   = 'delivery.failure_streak',
  BILLING_LIMIT      = 'billing.limit_reached',
  BILLING_OVERAGE    = 'billing.overage',
  SLA_BREACH         = 'sla.breach',
}

/**
 * OperationalWebhook — system-event callbacks fired by the delivery pipeline.
 *
 * DBA decisions:
 * - Hot query: { projectId, isActive:true, events:{$in:[eventType]} }
 *   The multikey index on events[] covers the $in lookup.
 * - totalFired updated atomically via $inc; lastFiredAt via $set
 * - Partial index on isActive:true — disabled hooks not touched during delivery
 */
@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class OperationalWebhook extends Document {
  @Prop({ required: true }) projectId:   string;
  @Prop({ required: true }) url:         string;
  @Prop({ required: true }) secret:      string;
  @Prop({
    type: [String],
    default: Object.values(OperationalEvent),
    enum: Object.values(OperationalEvent),
  })
  events: string[];
  @Prop({ default: true })               isActive:    boolean;
  @Prop({ type: String, trim: true }) description: string;
  @Prop({ type: Date, default: null })   lastFiredAt: Date | null;  // $set atomically
  @Prop({ default: 0 })                  totalFired:  number;        // $inc atomically
}

export const OperationalWebhookSchema = SchemaFactory.createForClass(OperationalWebhook);

// DELIVERY HOT PATH: active hooks for a project filtered by event type
// Multikey index on events[] supports $in queries efficiently
OperationalWebhookSchema.index(
  { projectId: 1, isActive: 1, events: 1 },
  {
    partialFilterExpression: { isActive: true },
    name: 'idx_project_active_events_partial',
  },
);

// Management list: all hooks for a project
OperationalWebhookSchema.index(
  { projectId: 1 },
  { name: 'idx_project' },
);
