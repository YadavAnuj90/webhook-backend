import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Model } from 'mongoose';
import { Queue } from 'bull';
import axios from 'axios';
import * as CircuitBreaker from 'opossum';

import { WebhookEvent, EventStatus } from '../events/schemas/event.schema';
import { DeliveryLog } from './schemas/delivery-log.schema';
import { Endpoint, EndpointStatus } from '../endpoints/schemas/endpoint.schema';
import { EndpointRateLimiterService } from '../endpoints/endpoint-rate-limiter.service';
import { FilterEngineService } from '../../utils/filter-engine.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SignatureUtil } from '../../utils/signature.util';
import { getNextRetryAt, MAX_RETRY_ATTEMPTS } from '../../utils/retry.util';
import { WEBHOOK_QUEUE, DEAD_LETTER_QUEUE } from '../../queue/queue.constants';

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private breakers = new Map<string, CircuitBreaker>();

  constructor(
    @InjectModel(WebhookEvent.name) private eventModel: Model<WebhookEvent>,
    @InjectModel(DeliveryLog.name) private logModel: Model<DeliveryLog>,
    @InjectModel(Endpoint.name) private endpointModel: Model<Endpoint>,
    @InjectQueue(WEBHOOK_QUEUE) private webhookQueue: Queue,
    @InjectQueue(DEAD_LETTER_QUEUE) private dlqQueue: Queue,
    private rateLimiter: EndpointRateLimiterService,
    private filterEngine: FilterEngineService,
    private analytics: AnalyticsService,
    private metrics: MetricsService,
    private notifications: NotificationsService,
  ) {}

  async deliver(eventId: string): Promise<void> {
    const event = await this.eventModel.findById(eventId);
    if (!event) return;

    const endpoint = await this.endpointModel.findById(event.endpointId);
    if (!endpoint || endpoint.status !== EndpointStatus.ACTIVE) return;

    // ─── 1. Filter Rules ────────────────────────────────────────────────────
    const passes = this.filterEngine.evaluate(endpoint.filterRules, event.eventType, event.payload);
    if (!passes) {
      this.logger.log(`🔍 Event ${eventId} filtered out by rules`);
      await this.eventModel.findByIdAndUpdate(eventId, { status: EventStatus.FILTERED });
      await this.analytics.record({ projectId: event.projectId, endpointId: endpoint.id, metric: 'filtered' });
      this.metrics.webhooksFiltered.inc({ project_id: event.projectId, endpoint_id: endpoint.id });
      return;
    }

    // ─── 2. Rate Limiting ────────────────────────────────────────────────────
    const { allowed, reason } = await this.rateLimiter.checkRateLimit(endpoint.id);
    if (!allowed) {
      this.logger.warn(`⛔ Rate limited: ${reason}`);
      await this.eventModel.findByIdAndUpdate(eventId, { status: EventStatus.RATE_LIMITED });
      await this.analytics.record({ projectId: event.projectId, endpointId: endpoint.id, metric: 'rateLimited' });
      this.metrics.webhooksRateLimited.inc({ project_id: event.projectId, endpoint_id: endpoint.id });
      return;
    }

    // ─── 3. Circuit Breaker Check ────────────────────────────────────────────
    const breaker = this.getBreaker(endpoint.id);
    if (breaker.opened) {
      this.logger.warn(`⚡ Circuit open for ${endpoint.id}, scheduling retry`);
      await this.scheduleRetry(event);
      return;
    }

    // ─── 4. HTTP Delivery ────────────────────────────────────────────────────
    const payload = JSON.stringify(event.payload);
    const signature = SignatureUtil.generate(payload, endpoint.secret);
    const start = Date.now();

    const deliveryFn = () => axios.post(endpoint.url, event.payload, {
      timeout: endpoint.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event-Type': event.eventType,
        'X-Webhook-Event-Id': String(event._id),
        'X-Webhook-Attempt': String(event.retryCount + 1),
        'X-Webhook-Project-Id': event.projectId,
        ...endpoint.headers,
      },
    });

    try {
      const response = await breaker.fire(deliveryFn);
      const latencyMs = Date.now() - start;

      // ✅ Success
      await this.logModel.create({
        eventId: event.id, endpointId: endpoint.id, projectId: event.projectId,
        attempt: event.retryCount + 1, success: true,
        statusCode: response.status,
        responseBody: JSON.stringify(response.data).slice(0, 500),
        latencyMs, attemptedAt: new Date(),
      });

      await this.eventModel.findByIdAndUpdate(event.id, {
        status: EventStatus.DELIVERED, deliveredAt: new Date(), lastAttemptAt: new Date(),
      });

      await this.endpointModel.findByIdAndUpdate(endpoint.id, {
        failureCount: 0, lastSuccessAt: new Date(),
        $inc: { totalDelivered: 1 },
      });

      // Analytics + Metrics
      await this.analytics.record({
        projectId: event.projectId, endpointId: endpoint.id,
        metric: 'delivered', latencyMs,
        statusCode: response.status, eventType: event.eventType,
      });
      this.metrics.webhooksDelivered.inc({
        project_id: event.projectId, endpoint_id: endpoint.id, event_type: event.eventType,
      });
      this.metrics.deliveryDuration.observe(
        { project_id: event.projectId, endpoint_id: endpoint.id, status: 'success' },
        latencyMs,
      );

      this.logger.log(`✅ Delivered ${event.id} → ${endpoint.url} in ${latencyMs}ms`);

    } catch (err: any) {
      const latencyMs = Date.now() - start;
      const statusCode = err.response?.status;
      const errorMessage = err.message;
      const newRetryCount = event.retryCount + 1;

      await this.logModel.create({
        eventId: event.id, endpointId: endpoint.id, projectId: event.projectId,
        attempt: newRetryCount, success: false,
        statusCode, latencyMs, errorMessage, attemptedAt: new Date(),
      });

      await this.endpointModel.findByIdAndUpdate(endpoint.id, {
        $inc: { failureCount: 1, totalFailed: 1 },
        lastFailureAt: new Date(),
      });

      // Analytics + Metrics
      await this.analytics.record({
        projectId: event.projectId, endpointId: endpoint.id,
        metric: 'failed', latencyMs,
        statusCode, eventType: event.eventType,
      });
      this.metrics.webhooksFailed.inc({
        project_id: event.projectId, endpoint_id: endpoint.id,
        event_type: event.eventType, status_code: String(statusCode || 'unknown'),
      });

      if (newRetryCount >= MAX_RETRY_ATTEMPTS) {
        // 💀 DLQ
        await this.eventModel.findByIdAndUpdate(event.id, {
          status: EventStatus.DEAD, retryCount: newRetryCount,
          lastAttemptAt: new Date(), deadAt: new Date(),
          lastError: { message: errorMessage, statusCode },
        });
        await this.dlqQueue.add({ eventId: event.id, endpointId: endpoint.id });
        await this.analytics.record({ projectId: event.projectId, endpointId: endpoint.id, metric: 'dead' });
        this.metrics.webhooksDead.inc({ project_id: event.projectId, endpoint_id: endpoint.id });
        await this.notifications.notifyEndpointDown(endpoint.name, endpoint.url, errorMessage);
        this.logger.warn(`💀 Event ${event.id} → DLQ`);
      } else {
        const nextRetryAt = getNextRetryAt(newRetryCount);
        await this.eventModel.findByIdAndUpdate(event.id, {
          status: EventStatus.FAILED, retryCount: newRetryCount,
          lastAttemptAt: new Date(), nextRetryAt,
          lastError: { message: errorMessage, statusCode },
        });
        await this.scheduleRetry(event, newRetryCount);
      }
    }
  }

  async replay(eventId: string): Promise<void> {
    const event = await this.eventModel.findByIdAndUpdate(
      eventId,
      { status: EventStatus.PENDING, retryCount: 0, nextRetryAt: null, lastError: null },
      { new: true },
    );
    if (!event) throw new Error(`Event ${eventId} not found`);
    await this.webhookQueue.add({ eventId }, { attempts: 1 });
    this.metrics.webhooksReplayed.inc({ project_id: event.projectId });
  }

  async getDeliveryLogs(eventId: string): Promise<DeliveryLog[]> {
    return this.logModel.find({ eventId }).sort({ attemptedAt: -1 }).exec();
  }

  async getDlqEvents(projectId: string) {
    return this.eventModel.find({ projectId, status: EventStatus.DEAD }).sort({ deadAt: -1 }).exec();
  }

  private getBreaker(endpointId: string): CircuitBreaker {
    if (!this.breakers.has(endpointId)) {
      const breaker = new CircuitBreaker(async (fn: any) => fn(), {
        timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '10000'),
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        volumeThreshold: 5,
      });
      breaker.on('open', () => {
        this.logger.warn(`⚡ Circuit OPEN for ${endpointId}`);
        this.metrics.circuitBreakersOpen.inc();
        this.notifications.notifyCircuitOpen(endpointId, '').catch(() => {});
      });
      breaker.on('close', () => {
        this.logger.log(`✅ Circuit CLOSED for ${endpointId}`);
        this.metrics.circuitBreakersOpen.dec();
      });
      this.breakers.set(endpointId, breaker);
    }
    return this.breakers.get(endpointId)!;
  }

  private async scheduleRetry(event: WebhookEvent, retryCount?: number): Promise<void> {
    const count = retryCount ?? event.retryCount;
    const nextRetryAt = getNextRetryAt(count);
    if (!nextRetryAt) return;
    const delay = nextRetryAt.getTime() - Date.now();
    await this.webhookQueue.add(
      { eventId: event.id },
      { delay, attempts: 1, jobId: `retry-${event.id}-${count}` },
    );
  }
}
