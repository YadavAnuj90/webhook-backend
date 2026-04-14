import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AnalyticsBucket } from './schemas/analytics-bucket.schema';
import { DeliveryLog } from '../delivery/schemas/delivery-log.schema';

export type MetricType = 'delivered' | 'failed' | 'dead' | 'filtered' | 'rateLimited';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectModel(AnalyticsBucket.name) private bucketModel: Model<AnalyticsBucket>,
    @InjectModel(DeliveryLog.name) private deliveryLogModel: Model<DeliveryLog>,
  ) {}

  async record(params: {
    projectId: string;
    endpointId: string;
    metric: MetricType;
    latencyMs?: number;
    statusCode?: number;
    eventType?: string;
  }): Promise<void> {
    const bucketHour = this.truncateToHour(new Date());

    const inc: any = { [params.metric]: 1 };
    const set: any = {};

    if (params.latencyMs !== undefined && params.metric === 'delivered') {
      inc.totalLatencyMs = params.latencyMs;
      inc.deliveryCount = 1;
    }

    const existing = await this.bucketModel.findOne({
      projectId: params.projectId,
      endpointId: params.endpointId,
      bucketHour,
    });

    if (params.latencyMs && existing) {
      if (!existing.minLatencyMs || params.latencyMs < existing.minLatencyMs) {
        set.minLatencyMs = params.latencyMs;
      }
      if (params.latencyMs > (existing.maxLatencyMs || 0)) {
        set.maxLatencyMs = params.latencyMs;
      }
    }

    if (params.statusCode) {
      inc[`statusCodeCounts.${params.statusCode}`] = 1;
    }
    if (params.eventType) {
      inc[`eventTypeCounts.${params.eventType}`] = 1;
    }

    await this.bucketModel.findOneAndUpdate(
      { projectId: params.projectId, endpointId: params.endpointId, bucketHour },
      { $inc: inc, ...(Object.keys(set).length ? { $set: set } : {}) },
      { upsert: true },
    );
  }

  async getTimeSeries(params: {
    projectId: string;
    endpointId?: string;
    from: Date;
    to: Date;
    granularity?: 'hour' | 'day';
  }) {
    const match: any = {
      projectId: params.projectId,
      bucketHour: { $gte: params.from, $lte: params.to },
    };
    if (params.endpointId) match.endpointId = params.endpointId;

    if (params.granularity === 'day') {
      return this.bucketModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$bucketHour' } },
              endpointId: '$endpointId',
            },
            delivered: { $sum: '$delivered' },
            failed: { $sum: '$failed' },
            dead: { $sum: '$dead' },
            filtered: { $sum: '$filtered' },
            rateLimited: { $sum: '$rateLimited' },
            totalLatencyMs: { $sum: '$totalLatencyMs' },
            deliveryCount: { $sum: '$deliveryCount' },
            minLatencyMs: { $min: '$minLatencyMs' },
            maxLatencyMs: { $max: '$maxLatencyMs' },
          },
        },
        { $sort: { '_id.date': 1 } },
      ]);
    }

    const buckets = await this.bucketModel
      .find(match)
      .sort({ bucketHour: 1 })
      .lean();

    return buckets.map(b => ({
      hour: b.bucketHour,
      endpointId: b.endpointId,
      delivered: b.delivered,
      failed: b.failed,
      dead: b.dead,
      filtered: b.filtered,
      rateLimited: b.rateLimited,
      avgLatencyMs: b.deliveryCount > 0 ? Math.round(b.totalLatencyMs / b.deliveryCount) : 0,
      minLatencyMs: b.minLatencyMs,
      maxLatencyMs: b.maxLatencyMs,
      successRate: b.delivered + b.failed > 0
        ? ((b.delivered / (b.delivered + b.failed)) * 100).toFixed(1)
        : '100.0',
    }));
  }

  async getSummary(projectId: string, endpointId?: string, days = 30) {
    const from = new Date(Date.now() - days * 86_400_000);
    const match: any = { projectId, bucketHour: { $gte: from } };
    if (endpointId) match.endpointId = endpointId;

    const [result] = await this.bucketModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalDelivered:   { $sum: '$delivered' },
          totalFailed:      { $sum: '$failed' },
          totalDead:        { $sum: '$dead' },
          totalFiltered:    { $sum: '$filtered' },
          totalRateLimited: { $sum: '$rateLimited' },
          totalLatencyMs:   { $sum: '$totalLatencyMs' },
          deliveryCount:    { $sum: '$deliveryCount' },
          minLatencyMs:     { $min: '$minLatencyMs' },
          maxLatencyMs:     { $max: '$maxLatencyMs' },
        },
      },
    ]);

    if (!result) return this.emptyStats();

    const total = result.totalDelivered + result.totalFailed;
    return {
      delivered:      result.totalDelivered,
      failed:         result.totalFailed,
      dead:           result.totalDead,
      filtered:       result.totalFiltered,
      rateLimited:    result.totalRateLimited,
      total,
      successRate:    total > 0 ? ((result.totalDelivered / total) * 100).toFixed(2) + '%' : '100.00%',
      avgLatencyMs:   result.deliveryCount > 0 ? Math.round(result.totalLatencyMs / result.deliveryCount) : 0,
      minLatencyMs:   result.minLatencyMs || 0,
      maxLatencyMs:   result.maxLatencyMs || 0,
      periodDays:     days,
    };
  }

  async getEventTypeBreakdown(projectId: string, endpointId?: string, days = 7) {
    const from = new Date(Date.now() - days * 86_400_000);
    const match: any = { projectId, bucketHour: { $gte: from } };
    if (endpointId) match.endpointId = endpointId;

    const buckets = await this.bucketModel.find(match).lean();
    const counts: Record<string, number> = {};

    for (const b of buckets) {
      for (const [type, count] of Object.entries(b.eventTypeCounts || {})) {
        counts[type] = (counts[type] || 0) + (count as number);
      }
    }

    return Object.entries(counts)
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((a, b) => b.count - a.count);
  }

  private truncateToHour(date: Date): Date {
    const d = new Date(date);
    d.setMinutes(0, 0, 0);
    return d;
  }

  private emptyStats() {
    return {
      delivered: 0,
      failed: 0,
      dead: 0,
      filtered: 0,
      rateLimited: 0,
      total: 0,
      successRate: '100.00%',
      avgLatencyMs: 0,
      minLatencyMs: 0,
      maxLatencyMs: 0,
      periodDays: 30,
    };
  }

  async getHeatmap(projectId: string) {

    const raw = await this.deliveryLogModel.aggregate([
      { $match: { projectId } },
      {
        $group: {
          _id: {
            day: { $dayOfWeek: '$attemptedAt' },
            hour: { $hour: '$attemptedAt' },
          },
          total: { $sum: 1 },
          success: {
            $sum: { $cond: [{ $lt: ['$statusCode', 400] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] },
          },
        },
      },
    ]);

    const matrix = Array.from({ length: 7 }, () =>
      Array(24).fill({ total: 0, success: 0, failed: 0 }),
    );

    raw.forEach((r) => {
      if (r._id.day >= 1 && r._id.day <= 7 && r._id.hour >= 0 && r._id.hour < 24) {
        matrix[r._id.day - 1][r._id.hour] = {
          total: r.total,
          success: r.success,
          failed: r.failed,
        };
      }
    });

    return {
      matrix,
      days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    };
  }
}
