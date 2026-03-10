import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Endpoint } from './schemas/endpoint.schema';

@Injectable()
export class EndpointRateLimiterService {
  private readonly logger = new Logger(EndpointRateLimiterService.name);

  constructor(@InjectModel(Endpoint.name) private endpointModel: Model<Endpoint>) {}

  /**
   * Check if endpoint is within rate limits.
   * Returns { allowed: boolean, reason?: string }
   */
  async checkRateLimit(endpointId: string): Promise<{ allowed: boolean; reason?: string }> {
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

    // Check limits
    if (endpoint.deliveriesThisMinute >= rl.maxPerMinute) {
      return { allowed: false, reason: `Rate limit exceeded: ${rl.maxPerMinute}/min` };
    }
    if (endpoint.deliveriesThisHour >= rl.maxPerHour) {
      return { allowed: false, reason: `Rate limit exceeded: ${rl.maxPerHour}/hour` };
    }
    if (endpoint.deliveriesThisDay >= rl.maxPerDay) {
      return { allowed: false, reason: `Rate limit exceeded: ${rl.maxPerDay}/day` };
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
