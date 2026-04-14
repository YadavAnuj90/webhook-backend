import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Endpoint } from './schemas/endpoint.schema';

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;

  retryAfterMs?: number;

  limitType?: 'minute' | 'hour' | 'day';
}

@Injectable()
export class EndpointRateLimiterService {
  private readonly logger = new Logger(EndpointRateLimiterService.name);

  constructor(@InjectModel(Endpoint.name) private endpointModel: Model<Endpoint>) {}

  async checkRateLimit(endpointId: string): Promise<RateLimitResult> {
    const now = new Date();

    const reset = await this.endpointModel.findByIdAndUpdate(
      endpointId,
      [
        {
          $set: {
            deliveriesThisMinute: { $cond: [{ $lt: ['$minuteResetAt', now] }, 0, '$deliveriesThisMinute'] },
            minuteResetAt:        { $cond: [{ $lt: ['$minuteResetAt', now] }, new Date(now.getTime() + 60_000),        '$minuteResetAt'] },
            deliveriesThisHour:   { $cond: [{ $lt: ['$hourResetAt',   now] }, 0, '$deliveriesThisHour'] },
            hourResetAt:          { $cond: [{ $lt: ['$hourResetAt',   now] }, new Date(now.getTime() + 3_600_000),     '$hourResetAt'] },
            deliveriesThisDay:    { $cond: [{ $lt: ['$dayResetAt',    now] }, 0, '$deliveriesThisDay'] },
            dayResetAt:           { $cond: [{ $lt: ['$dayResetAt',    now] }, new Date(now.getTime() + 86_400_000),    '$dayResetAt'] },
          },
        },
      ],
      { new: true },
    ).lean();

    if (!reset) return { allowed: false, reason: 'Endpoint not found' };
    const rl = reset.rateLimit;

    if (reset.deliveriesThisMinute >= rl.maxPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${rl.maxPerMinute}/min`,
        retryAfterMs: Math.max(0, new Date(reset.minuteResetAt!).getTime() - now.getTime()),
        limitType: 'minute',
      };
    }
    if (reset.deliveriesThisHour >= rl.maxPerHour) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${rl.maxPerHour}/hour`,
        retryAfterMs: Math.max(0, new Date(reset.hourResetAt!).getTime() - now.getTime()),
        limitType: 'hour',
      };
    }
    if (reset.deliveriesThisDay >= rl.maxPerDay) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${rl.maxPerDay}/day`,
        retryAfterMs: Math.max(0, new Date(reset.dayResetAt!).getTime() - now.getTime()),
        limitType: 'day',
      };
    }

    const inc = await this.endpointModel.findOneAndUpdate(
      {
        _id: endpointId,
        deliveriesThisMinute: { $lt: rl.maxPerMinute },
        deliveriesThisHour:   { $lt: rl.maxPerHour },
        deliveriesThisDay:    { $lt: rl.maxPerDay },
      },
      { $inc: { deliveriesThisMinute: 1, deliveriesThisHour: 1, deliveriesThisDay: 1 } },
      { new: true },
    ).lean();

    if (!inc) {

      const nextMinute = new Date(reset.minuteResetAt!).getTime() - now.getTime();
      return {
        allowed: false,
        reason: 'Rate limit race — another delivery hit the cap first',
        retryAfterMs: Math.max(500, nextMinute),
        limitType: 'minute',
      };
    }

    return { allowed: true };
  }

  async getCurrentUsage(endpointId: string) {
    const ep = await this.endpointModel.findById(endpointId).lean();
    if (!ep) return null;
    return {
      minute: { used: ep.deliveriesThisMinute, limit: ep.rateLimit.maxPerMinute, resetsAt: ep.minuteResetAt },
      hour:   { used: ep.deliveriesThisHour,   limit: ep.rateLimit.maxPerHour,   resetsAt: ep.hourResetAt },
      day:    { used: ep.deliveriesThisDay,     limit: ep.rateLimit.maxPerDay,    resetsAt: ep.dayResetAt },
    };
  }
}
