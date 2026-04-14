import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

@Injectable()
export class RedisCache {
  private readonly logger = new Logger(RedisCache.name);
  private readonly prefix = process.env.REDIS_PREFIX || 'whk';

  constructor(@InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue) {}

  private async client(): Promise<any> {
    return (this.queue as any).client;
  }

  private k(key: string) { return `${this.prefix}:cache:${key}`; }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const c = await this.client();
      const raw = await c.get(this.k(key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err: any) {
      this.logger.debug(`cache.get(${key}) failed: ${err?.message}`);
      return null;
    }
  }

  async set<T = any>(key: string, value: T, ttlSeconds = 60): Promise<void> {
    try {
      const c = await this.client();
      await c.set(this.k(key), JSON.stringify(value), 'EX', Math.max(1, ttlSeconds));
    } catch (err: any) {
      this.logger.debug(`cache.set(${key}) failed: ${err?.message}`);
    }
  }

  async del(key: string | string[]): Promise<void> {
    try {
      const c = await this.client();
      const keys = (Array.isArray(key) ? key : [key]).map(k => this.k(k));
      if (keys.length) await c.del(...keys);
    } catch (err: any) {
      this.logger.debug(`cache.del failed: ${err?.message}`);
    }
  }

  async getOrSet<T = any>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds = 60,
  ): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
    const fresh = await loader();
    if (fresh !== null && fresh !== undefined) {
      this.set(key, fresh, ttlSeconds).catch(() => {});
    }
    return fresh;
  }

  async delByPrefix(prefix: string): Promise<void> {
    try {
      const c = await this.client();
      const match = this.k(prefix) + '*';
      const stream = c.scanStream({ match, count: 200 });
      const batch: string[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (keys: string[]) => batch.push(...keys));
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });
      if (batch.length) await c.del(...batch);
    } catch (err: any) {
      this.logger.debug(`cache.delByPrefix failed: ${err?.message}`);
    }
  }
}
