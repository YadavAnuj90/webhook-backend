import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class DeliveryLog extends Document {
  @Prop({ required: true }) eventId: string;
  @Prop({ required: true }) endpointId: string;
  @Prop({ required: true }) projectId: string;
  @Prop({ required: true }) attempt: number;
  @Prop({ required: true }) success: boolean;
  @Prop() statusCode: number;
  @Prop() responseBody: string;
  @Prop() latencyMs: number;
  @Prop() errorMessage: string;
  @Prop() attemptedAt: Date;
}

export const DeliveryLogSchema = SchemaFactory.createForClass(DeliveryLog);
DeliveryLogSchema.index({ eventId: 1 });
DeliveryLogSchema.index({ endpointId: 1, attemptedAt: -1 });
DeliveryLogSchema.index({ projectId: 1, attemptedAt: -1 });
// Auto-delete logs after 90 days
DeliveryLogSchema.index({ attemptedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
