import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Redis from 'ioredis';
import axios from 'axios';

import { WebhookEvent } from '../events/schemas/event.schema';
import { Endpoint } from '../endpoints/schemas/endpoint.schema';
import { DeliveryLog } from './schemas/delivery-log.schema';

@Injectable()
export class BatchDeliveryService {
  private readonly logger = new Logger(BatchDeliveryService.name);
  private redis: Redis.Redis;

  constructor(
    @InjectModel(WebhookEvent.name) private eventModel: Model<WebhookEvent>,
    @InjectModel(Endpoint.name) private endpointModel: Model<Endpoint>,
    @InjectModel(DeliveryLog.name) private logModel: Model<DeliveryLog>,
  ) {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD;
    this.redis = new Redis.default({ host, port, password: password || undefined });
  }

  async addToBatch(
    endpointId: string,
    eventId: string,
    windowSeconds: number,
    maxSize: number,
  ): Promise<void> {
    const key = `batch:${endpointId}`;

    await this.redis.lpush(key, eventId);

    await this.redis.expire(key, windowSeconds);

    const len = await this.redis.llen(key);

    if (len >= maxSize) {
      await this.flushBatch(endpointId);
    }
  }

  async flushBatch(endpointId: string): Promise<void> {
    const key = `batch:${endpointId}`;

    const eventIds: string[] = await this.redis.lrange(key, 0, -1);
    if (eventIds.length === 0) return;

    await this.redis.del(key);

    const endpoint = await this.endpointModel.findById(endpointId);
    if (!endpoint) return;

    const events = await this.eventModel.find({ _id: { $in: eventIds } });
    const payloads = events.map((e) => e.payload);

    const batchPayload = {
      events: payloads,
      batchSize: payloads.length,
      batchedAt: new Date().toISOString(),
    };

    try {
      const response = await axios.post(endpoint.url, batchPayload, {
        timeout: endpoint.timeoutMs || 30000,
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Batch-Size': String(payloads.length),
          ...endpoint.headers,
        },
      });

      if (response.status >= 200 && response.status < 300) {

        await Promise.all(
          eventIds.map((id) =>
            this.eventModel.findByIdAndUpdate(id, {
              status: 'delivered',
              deliveredAt: new Date(),
            }),
          ),
        );

        await this.logModel.create({
          eventId: eventIds[0],
          endpointId: endpoint.id,
          projectId: endpoint.projectId,
          attempt: 1,
          success: true,
          statusCode: response.status,
          responseBody: JSON.stringify(response.data).slice(0, 500),
          latencyMs: 0,
          attemptedAt: new Date(),
        });

        this.logger.log(
          `Batch delivered: ${payloads.length} events to ${endpoint.url}`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Batch delivery failed for endpoint ${endpointId}: ${err.message}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async flushPendingBatches(): Promise<void> {
    const pattern = 'batch:*';
    const keys = await this.redis.keys(pattern);

    for (const key of keys) {
      const endpointId = key.replace('batch:', '');
      await this.flushBatch(endpointId);
    }
  }
}
