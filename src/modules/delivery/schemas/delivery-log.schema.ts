import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

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

  @Prop({ type: String, default: null }) requestId: string | null;
}

export const DeliveryLogSchema = SchemaFactory.createForClass(DeliveryLog);

DeliveryLogSchema.index(
  { eventId: 1, attempt: 1 },
  { unique: true, name: 'uq_event_attempt' },
);

DeliveryLogSchema.index(
  { endpointId: 1, success: 1, attemptedAt: -1 },
  { name: 'idx_endpoint_success_time' },
);

DeliveryLogSchema.index(
  { projectId: 1, success: 1, attemptedAt: -1 },
  { name: 'idx_project_success_time' },
);

DeliveryLogSchema.index(
  { endpointId: 1, attemptedAt: -1 },
  { name: 'idx_endpoint_time' },
);

DeliveryLogSchema.index(
  { projectId: 1, attemptedAt: -1 },
  {
    partialFilterExpression: { success: false },
    name: 'idx_project_failures_partial',
  },
);

DeliveryLogSchema.index(
  { attemptedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 3600, name: 'ttl_delivery_log' },
);
