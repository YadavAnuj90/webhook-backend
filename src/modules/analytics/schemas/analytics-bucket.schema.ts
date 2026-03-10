import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Hourly bucket per endpoint — stores aggregated metrics
@Schema()
export class AnalyticsBucket extends Document {
  @Prop({ required: true })
  projectId: string;

  @Prop({ required: true })
  endpointId: string;

  // Time bucket — truncated to hour
  @Prop({ required: true })
  bucketHour: Date;

  // Delivery stats
  @Prop({ default: 0 }) delivered: number;
  @Prop({ default: 0 }) failed: number;
  @Prop({ default: 0 }) dead: number;
  @Prop({ default: 0 }) filtered: number;   // blocked by filter rules
  @Prop({ default: 0 }) rateLimited: number; // blocked by rate limit

  // Latency tracking
  @Prop({ default: 0 }) totalLatencyMs: number;
  @Prop({ default: 0 }) deliveryCount: number; // for avg calculation
  @Prop({ default: 0 }) minLatencyMs: number;
  @Prop({ default: 0 }) maxLatencyMs: number;

  // Event type breakdown
  @Prop({ type: Object, default: {} })
  eventTypeCounts: Record<string, number>;

  // HTTP status code breakdown
  @Prop({ type: Object, default: {} })
  statusCodeCounts: Record<string, number>;
}

export const AnalyticsBucketSchema = SchemaFactory.createForClass(AnalyticsBucket);
AnalyticsBucketSchema.index({ projectId: 1, endpointId: 1, bucketHour: 1 }, { unique: true });
AnalyticsBucketSchema.index({ projectId: 1, bucketHour: 1 });
AnalyticsBucketSchema.index({ bucketHour: 1 }, { expireAfterSeconds: 90 * 24 * 3600 }); // TTL: 90 days
