import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Endpoint } from './schemas/endpoint.schema';

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  /** If not allowed, delay in ms until the earliest rate window resets */
  retryAfterMs?: number;
  /** Which window was exceeded: 'minute' | 'hour' | 'day' */
  limitType?: 'minute' | 'hour' | 'day';
}

@Injectable()
export class EndpointRateLimiterService {
  private readonly logger = new Logger(EndpointRateLimiterService.name);

  constructor(@InjectModel(Endpoint.name) private endpointModel: Model<Endpoint>) {}

  /**
   * Check if endpoint is within rate limits.
   * Returns { allowed, reason?, retryAfterMs?, limitType? }
   *
   * When rate-limited, retryAfterMs tells the caller how long to delay
   * before the window resets — enabling drip-delivery instead of rejection.
   */
  async checkRateLimit(endpointId: string): Promise<RateLimitResult> {
    const endpoint = await this.endpointModel.findById(endpointId);
    if (!endpoint) return { allowed: false, reason: 'Endpoint not found' };

    const now = new Date();
    const rl = endpoint.rateLimit;

    // Reset counters if window expired
    const updates: any = {};

    if (!endpoint.minuteResetAt || now > endpoint.minuteResetAt) {
      updates.deliveriesThisMinute = 0;
      updates.minuteResetAt = new Date(now.getTime() + 60_000);
    }
    if (!endpoint.hourResetAt || now > endpoint.hourResetAt) {
      updates.deliveriesThisHour = 0;
      updates.hourResetAt = new Date(now.getTime() + 3_600_000);
    }
    if (!endpoint.dayResetAt || now > endpoint.dayResetAt) {
      updates.deliveriesThisDay = 0;
      updates.dayResetAt = new Date(now.getTime() + 86_400_000);
    }

    if (Object.keys(updates).length > 0) {
      await this.endpointModel.findByIdAndUpdate(endpointId, updates);
      Object.assign(endpoint, updates);
    }

    // Check limits — return retryAfterMs for drip-delivery queuing
    if (endpoint.deliveriesThisMinute >= rl.maxPerMinute) {
      const retryAfterMs = Math.max(0, (endpoint.minuteResetAt?.getTime() || now.getTime() + 60_000) - now.getTime());
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${rl.maxPerMinute}/min`,
        retryAfterMs,
        limitType: 'minute',
      };
    }
    if (endpoint.deliveriesThisHour >= rl.maxPerHour) {
      const retryAfterMs = Math.max(0, (endpoint.hourResetAt?.getTime() || now.getTime() + 3_600_000) - now.getTime());
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${rl.maxPerHour}/hour`,
        retryAfterMs,
        limitType: 'hour',
      };
    }
    if (endpoint.deliveriesThisDay >= rl.maxPerDay) {
      const retryAfterMs = Math.max(0, (endpoint.dayResetAt?.getTime() || now.getTime() + 86_400_000) - now.getTime());
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${rl.maxPerDay}/day`,
        retryAfterMs,
        limitType: 'day',
      };
    }

    // Increment counters
    await this.endpointModel.findByIdAndUpdate(endpointId, {
      $inc: {
        deliveriesThisMinute: 1,
        deliveriesThisHour: 1,
        deliveriesThisDay: 1,
      },
    });

    return { allowed: true };
  }

  async getCurrentUsage(endpointId: string) {
    const ep = await this.endpointModel.findById(endpointId);
    if (!ep) return null;
    return {
      minute: { used: ep.deliveriesThisMinute, limit: ep.rateLimit.maxPerMinute, resetsAt: ep.minuteResetAt },
      hour:   { used: ep.deliveriesThisHour,   limit: ep.rateLimit.maxPerHour,   resetsAt: ep.hourResetAt },
      day:    { used: ep.deliveriesThisDay,     limit: ep.rateLimit.maxPerDay,    resetsAt: ep.dayResetAt },
    };
  }
}
