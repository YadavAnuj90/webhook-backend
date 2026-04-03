import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * AnalyticsBucket — hourly rollup per endpoint.
 *
 * DBA decisions:
 * - versionKey:false + timestamps:false (bucketHour is the time axis)
 * - ALL numeric fields updated with a single atomic findOneAndUpdate:
 *     { $inc: { delivered:1, totalLatencyMs:lat, deliveryCount:1 },
 *       $min: { minLatencyMs:lat },
 *       $max: { maxLatencyMs:lat },
 *       $inc: { [`eventTypeCounts.order.created`]: 1 } }
 *   Zero read-modify-write races under concurrency.
 * - upsert:true on the unique compound key creates the bucket on first event.
 * - TTL keeps disk usage bounded (365 days default).
 */
@Schema({
  timestamps: false,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class AnalyticsBucket extends Document {
  @Prop({ required: true }) projectId:  string;
  @Prop({ required: true }) endpointId: string;
  // Truncated to hour: new Date(Math.floor(Date.now()/3_600_000)*3_600_000)
  @Prop({ required: true }) bucketHour: Date;

  // Counters — $inc
  @Prop({ default: 0 }) delivered:   number;
  @Prop({ default: 0 }) failed:      number;
  @Prop({ default: 0 }) dead:        number;
  @Prop({ default: 0 }) filtered:    number;
  @Prop({ default: 0 }) rateLimited: number;

  // Latency — $inc totalLatencyMs + deliveryCount; $min/$max for extremes
  @Prop({ default: 0 }) totalLatencyMs: number;
  @Prop({ default: 0 }) deliveryCount:  number;
  @Prop({ default: 0 }) minLatencyMs:   number;
  @Prop({ default: 0 }) maxLatencyMs:   number;

  // Breakdowns — nested $inc with dot-notation: `eventTypeCounts.${type}`
  @Prop({ type: Object, default: {} }) eventTypeCounts:  Record<string, number>;
  @Prop({ type: Object, default: {} }) statusCodeCounts: Record<string, number>;
}

export const AnalyticsBucketSchema = SchemaFactory.createForClass(AnalyticsBucket);

// Upsert key — unique guarantees exactly one bucket per (project, endpoint, hour)
AnalyticsBucketSchema.index(
  { projectId: 1, endpointId: 1, bucketHour: 1 },
  { unique: true, name: 'uq_bucket' },
);
// Time-series chart: all endpoints for a project over a range
AnalyticsBucketSchema.index({ projectId: 1, bucketHour: 1 }, { name: 'idx_project_time' });
// Heatmap: one endpoint over a range
AnalyticsBucketSchema.index({ endpointId: 1, bucketHour: 1 }, { name: 'idx_endpoint_time' });
// TTL
AnalyticsBucketSchema.index(
  { bucketHour: 1 },
  { expireAfterSeconds: 365 * 24 * 3600, name: 'ttl_bucket' },
);
