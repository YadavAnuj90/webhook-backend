import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createHash } from 'crypto';

@Injectable()
export class DeduplicationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeduplicationService.name);
  private redis: Redis;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.redis = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get('REDIS_PASSWORD') || undefined,
      keyPrefix: 'whk:dedup:',
      lazyConnect: true,
    });
    this.redis.connect().catch((e) => this.logger.warn(`Dedup Redis connect error: ${e.message}`));
  }

  onModuleDestroy() { this.redis?.quit(); }

  /**
   * Returns true if this is a DUPLICATE (already seen within the window).
   * Returns false if this is NEW (and records it for future dedup).
   *
   * @param projectId   Tenant isolation
   * @param endpointId  Endpoint isolation
   * @param key         Dedup key (idempotencyKey or content hash)
   * @param windowSecs  Dedup window in seconds (0 = no dedup)
   */
  async isDuplicate(
    projectId: string,
    endpointId: string,
    key: string,
    windowSecs: number,
  ): Promise<boolean> {
    if (!windowSecs || windowSecs <= 0) return false;
    const redisKey = `${projectId}:${endpointId}:${this.hash(key)}`;
    // NX = only set if Not eXists; returns 'OK' if set, null if already exists
    const result = await this.redis.set(redisKey, '1', 'EX', windowSecs, 'NX');
    return result === null; // null = key already existed = duplicate
  }

  /**
   * Compute a content hash for payload-based deduplication
   * (when no explicit idempotency key is provided)
   */
  hashPayload(payload: any): string {
    return this.hash(JSON.stringify(payload));
  }

  private hash(s: string): string {
    return createHash('sha256').update(s).digest('hex').slice(0, 32);
  }
}
