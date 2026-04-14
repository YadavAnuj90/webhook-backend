import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

/**
 * Readiness indicator for Redis (via the Bull queue's underlying client).
 * We piggy-back on Bull so we don't need a second Redis connection just for
 * health checks.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@InjectQueue(WEBHOOK_QUEUE) private readonly webhookQueue: Queue) {
    super();
  }

  async isHealthy(key = 'redis'): Promise<HealthIndicatorResult> {
    try {
      const client: any = await (this.webhookQueue as any).client;
      // ioredis exposes .ping(); guard for both the promise and callback shapes.
      const pong = await client.ping();
      const ok = pong === 'PONG' || pong === 'pong';
      if (!ok) {
        throw new HealthCheckError('Redis ping failed', this.getStatus(key, false, { pong }));
      }
      return this.getStatus(key, true, { pong });
    } catch (err: any) {
      throw new HealthCheckError(
        'Redis unavailable',
        this.getStatus(key, false, { message: err?.message || 'ping error' }),
      );
    }
  }
}
