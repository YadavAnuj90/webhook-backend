import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

@Injectable()
export class SharedCircuitBreaker implements OnModuleDestroy {
  private readonly logger = new Logger(SharedCircuitBreaker.name);
  private readonly prefix = process.env.REDIS_PREFIX || 'whk';
  private readonly windowMs = parseInt(process.env.BREAKER_WINDOW_MS || '60000', 10);
  private readonly resetMs = parseInt(process.env.BREAKER_RESET_MS || '30000', 10);
  private readonly threshold = parseInt(process.env.BREAKER_FAILURES || '10', 10);

  constructor(@InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue) {}

  private async client(): Promise<any> {

    return (this.queue as any).client;
  }

  private stateKey(endpointId: string) { return `${this.prefix}:cb:${endpointId}:state`; }
  private failsKey(endpointId: string) { return `${this.prefix}:cb:${endpointId}:fails`; }

  async isOpen(endpointId: string): Promise<boolean> {
    try {
      const c = await this.client();
      const v = await c.get(this.stateKey(endpointId));
      return v === 'open';
    } catch (err: any) {

      this.logger.debug(`breaker isOpen read failed: ${err?.message}`);
      return false;
    }
  }

  async recordFailure(endpointId: string): Promise<'closed' | 'open'> {
    try {
      const c = await this.client();
      const count = await c.incr(this.failsKey(endpointId));
      if (count === 1) {
        await c.pexpire(this.failsKey(endpointId), this.windowMs);
      }
      if (count >= this.threshold) {
        const already = await c.get(this.stateKey(endpointId));
        await c.set(this.stateKey(endpointId), 'open', 'PX', this.resetMs);
        if (already !== 'open') {
          this.logger.warn(`🚨 Circuit OPEN (shared) for ${endpointId} after ${count} failures`);
        }
        return 'open';
      }
      return 'closed';
    } catch (err: any) {
      this.logger.debug(`breaker recordFailure failed: ${err?.message}`);
      return 'closed';
    }
  }

  async recordSuccess(endpointId: string): Promise<void> {
    try {
      const c = await this.client();
      await Promise.all([
        c.del(this.stateKey(endpointId)),
        c.del(this.failsKey(endpointId)),
      ]);
    } catch (err: any) {
      this.logger.debug(`breaker recordSuccess failed: ${err?.message}`);
    }
  }

  async forceClose(endpointId: string): Promise<void> {
    await this.recordSuccess(endpointId);
  }

  async forceOpen(endpointId: string, durationMs = this.resetMs): Promise<void> {
    try {
      const c = await this.client();
      await c.set(this.stateKey(endpointId), 'open', 'PX', durationMs);
    } catch (err: any) {
      this.logger.debug(`breaker forceOpen failed: ${err?.message}`);
    }
  }

  async onModuleDestroy() {  }
}
