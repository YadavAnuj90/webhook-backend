import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: false,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class AnalyticsBucket extends Document {
  @Prop({ required: true }) projectId:  string;
  @Prop({ required: true }) endpointId: string;

  @Prop({ required: true }) bucketHour: Date;

  @Prop({ default: 0 }) delivered:   number;
  @Prop({ default: 0 }) failed:      number;
  @Prop({ default: 0 }) dead:        number;
  @Prop({ default: 0 }) filtered:    number;
  @Prop({ default: 0 }) rateLimited: number;

  @Prop({ default: 0 }) totalLatencyMs: number;
  @Prop({ default: 0 }) deliveryCount:  number;
  @Prop({ default: 0 }) minLatencyMs:   number;
  @Prop({ default: 0 }) maxLatencyMs:   number;

  @Prop({ type: Object, default: {} }) eventTypeCounts:  Record<string, number>;
  @Prop({ type: Object, default: {} }) statusCodeCounts: Record<string, number>;
}

export const AnalyticsBucketSchema = SchemaFactory.createForClass(AnalyticsBucket);

AnalyticsBucketSchema.index(
  { projectId: 1, endpointId: 1, bucketHour: 1 },
  { unique: true, name: 'uq_bucket' },
);

AnalyticsBucketSchema.index({ projectId: 1, bucketHour: 1 }, { name: 'idx_project_time' });

AnalyticsBucketSchema.index({ endpointId: 1, bucketHour: 1 }, { name: 'idx_endpoint_time' });

AnalyticsBucketSchema.index(
  { bucketHour: 1 },
  { expireAfterSeconds: 365 * 24 * 3600, name: 'ttl_bucket' },
);
