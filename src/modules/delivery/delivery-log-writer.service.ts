import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DeliveryLog } from './schemas/delivery-log.schema';

@Injectable()
export class DeliveryLogWriter implements OnModuleDestroy {
  private readonly logger = new Logger(DeliveryLogWriter.name);

  private readonly BATCH_SIZE  = parseInt(process.env.DELIVERY_LOG_BATCH_SIZE  || '100',  10);
  private readonly FLUSH_MS    = parseInt(process.env.DELIVERY_LOG_FLUSH_MS    || '1000', 10);
  private readonly MAX_BUFFER  = parseInt(process.env.DELIVERY_LOG_MAX_BUFFER  || '5000', 10);

  private buffer: any[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(@InjectModel(DeliveryLog.name) private logModel: Model<DeliveryLog>) {}

  enqueue(doc: Partial<DeliveryLog>): void {
    this.buffer.push(doc);

    if (this.buffer.length >= this.BATCH_SIZE) {
      this.flush().catch(() => {  });
      return;
    }

    if (this.buffer.length >= this.MAX_BUFFER) {
      this.flush().catch(() => {  });
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush().catch(() => {  });
      }, this.FLUSH_MS);

      if (typeof (this.timer as any)?.unref === 'function') (this.timer as any).unref();
    }
  }

  async writeNow(doc: Partial<DeliveryLog>): Promise<void> {
    try {
      await this.logModel.create(doc);
    } catch (err: any) {
      this.logger.error(`writeNow failed: ${err?.message || err}`);
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    if (this.buffer.length === 0) return;

    this.flushing = true;
    const batch = this.buffer;
    this.buffer = [];
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }

    try {

      await this.logModel.insertMany(batch, { ordered: false });
    } catch (err: any) {

      this.logger.error(`delivery-log flush failed (${batch.length} rows): ${err?.message || err}`);
    } finally {
      this.flushing = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.flush();
  }
}
