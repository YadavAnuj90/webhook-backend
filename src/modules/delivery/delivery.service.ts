import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Model } from 'mongoose';
import { Queue } from 'bull';
import axios, { AxiosRequestConfig } from 'axios';
import * as https from 'https';
import * as CircuitBreaker from 'opossum';
import * as dns from 'dns';
import { promisify } from 'util';

import { WebhookEvent, EventStatus } from '../events/schemas/event.schema';
import { DeliveryLog } from './schemas/delivery-log.schema';
import {
  Endpoint,
  EndpointStatus,
  SignatureScheme,
  EndpointType,
  EndpointAuthType,
  decryptEndpointSecrets,
} from '../endpoints/schemas/endpoint.schema';
import { assertSafeUrl, buildPinnedAgent, SsrfBlocked } from '../../utils/safe-http';
import { EndpointRateLimiterService } from '../endpoints/endpoint-rate-limiter.service';
import { FilterEngineService } from '../../utils/filter-engine.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SignatureUtil } from '../../utils/signature.util';
import {
  getNextRetryAt,
  getNextRetryAtForStrategy,
  MAX_RETRY_ATTEMPTS,
} from '../../utils/retry.util';
import { PiiScrubber } from '../../utils/pii-scrubber';
import { PayloadCrypto } from '../../utils/payload-crypto';
import { isInMaintenanceWindow } from '../../utils/maintenance-window';
import { WEBHOOK_QUEUE, DEAD_LETTER_QUEUE } from '../../queue/queue.constants';
import { RealtimeService } from '../realtime/realtime.service';

const oauth2TokenCache = new Map<string, { token: string; expiresAt: number }>();

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  private breakers = new Map<string, CircuitBreaker>();
  private dnsLookup = promisify(dns.lookup);

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
    private realtime: RealtimeService,

    @Optional() private readonly sharedBreaker?: import('./shared-breaker.service').SharedCircuitBreaker,

    @Optional() private readonly cache?: import('../../common/cache/redis-cache.service').RedisCache,

    @Optional() private readonly logWriter?: import('./delivery-log-writer.service').DeliveryLogWriter,
  ) {}

  async deliver(eventId: string): Promise<void> {
    const event = await this.eventModel.findById(eventId);
    if (!event) return;

    let endpointRaw: any = null;
    const cacheKey = `ep:${event.endpointId}`;
    if (this.cache) {
      endpointRaw = await this.cache.get<any>(cacheKey);
    }
    if (!endpointRaw) {
      endpointRaw = await this.endpointModel.findById(event.endpointId).lean();
      if (endpointRaw && this.cache) {
        this.cache.set(cacheKey, endpointRaw, parseInt(process.env.ENDPOINT_CACHE_TTL_S || '30', 10)).catch(() => {});
      }
    }
    if (!endpointRaw || endpointRaw.status !== EndpointStatus.ACTIVE) return;

    const endpoint = decryptEndpointSecrets(endpointRaw) as Endpoint;

    if (isInMaintenanceWindow(endpoint.maintenanceWindows)) {
      const windowEnd = new Date(Date.now() + 3600_000);
      await this.eventModel.findByIdAndUpdate(eventId, {
        nextRetryAt: windowEnd,
        status: EventStatus.RETRYING,
      });
      this.logger.log(
        `Delivery deferred: endpoint ${endpoint.id} in maintenance window`,
      );
      return;
    }

    let payload: any = event.payload;

    if (
      typeof payload === 'string' &&
      (payload as string).startsWith('enc:')
    ) {
      payload = JSON.parse(PayloadCrypto.decrypt(payload as string));
    }

    const passes = this.filterEngine.evaluate(
      endpoint.filterRules,
      event.eventType,
      payload,
    );
    if (!passes) {
      await this.eventModel.findByIdAndUpdate(eventId, {
        status: EventStatus.FILTERED,
      });
      await this.analytics.record({
        projectId: event.projectId,
        endpointId: endpoint.id,
        metric: 'filtered',
      });
      this.metrics.webhooksFiltered.inc({
        project_id: event.projectId,
        endpoint_id: endpoint.id,
      });
      this.realtime.notifyDeliveryFiltered({
        projectId: event.projectId,
        endpointId: endpoint.id,
        eventId: event.id,
        eventType: event.eventType,
      });
      return;
    }

    const rateLimitResult = await this.rateLimiter.checkRateLimit(endpoint.id);
    if (!rateLimitResult.allowed) {
      const retryAfterMs = rateLimitResult.retryAfterMs || 60_000;

      if (retryAfterMs > 3_600_000) {
        await this.eventModel.findByIdAndUpdate(eventId, { status: EventStatus.RATE_LIMITED });
        await this.analytics.record({ projectId: event.projectId, endpointId: endpoint.id, metric: 'rateLimited' });
        this.metrics.webhooksRateLimited.inc({ project_id: event.projectId, endpoint_id: endpoint.id });
        this.logger.warn(`Event ${eventId} hard rate-limited (${rateLimitResult.limitType} window, retry > 1h)`);
        return;
      }

      await this.eventModel.findByIdAndUpdate(eventId, {
        status: EventStatus.RATE_QUEUED,
        nextRetryAt: new Date(Date.now() + retryAfterMs),
      });
      await this.webhookQueue.add(
        'deliver',
        { eventId },
        {
          delay: retryAfterMs,
          attempts: 1,
          jobId: `drip-${eventId}-${Date.now()}`,
          removeOnComplete: true,
        },
      );
      this.realtime.notifyRateQueued({
        projectId: event.projectId,
        endpointId: endpoint.id,
        eventId: event.id,
        eventType: event.eventType,
        retryAfterMs,
      });
      this.logger.log(
        `Event ${eventId} drip-queued: delivering in ${Math.ceil(retryAfterMs / 1000)}s (${rateLimitResult.limitType} limit)`,
      );
      return;
    }

    const breaker = this.getBreaker(endpoint.id);
    if (breaker.opened) { await this.scheduleRetry(event); return; }
    if (this.sharedBreaker && await this.sharedBreaker.isOpen(endpoint.id)) {

      await this.scheduleRetry(event);
      return;
    }

    if (endpoint.endpointType === EndpointType.S3) {
      return this.deliverToS3(event, endpoint);
    }
    if (endpoint.endpointType === EndpointType.GCS) {
      return this.deliverToGcs(event, endpoint);
    }

    if (endpoint.allowedIps && endpoint.allowedIps.length > 0) {
      try {
        const hostname = new URL(endpoint.url).hostname;
        const dnsResult = await this.dnsLookup(hostname);
        const resolvedIp = dnsResult.address;
        if (!endpoint.allowedIps.includes(resolvedIp)) {
          await this.handleDeliveryFailure(
            event,
            endpoint,
            {
              message: `IP ${resolvedIp} not in allowlist`,
              isAxiosError: false,
            },
            0,
          );
          return;
        }
      } catch (err: any) {
        this.logger.warn(`DNS lookup failed for ${endpoint.url}: ${err.message}`);
      }
    }

    let deliveryPayload = payload;
    if (endpoint.maxPayloadBytes > 0) {
      const size = Buffer.byteLength(JSON.stringify(payload), 'utf8');
      if (size > endpoint.maxPayloadBytes) {
        await this.handleDeliveryFailure(
          event,
          endpoint,
          {
            message: `Payload too large: ${size} bytes (max: ${endpoint.maxPayloadBytes})`,
            isAxiosError: false,
          },
          0,
        );
        return;
      }
    }

    if (endpoint.piiFields && endpoint.piiFields.length > 0) {
      deliveryPayload = PiiScrubber.scrub(payload, endpoint.piiFields);
    }

    const payloadStr = JSON.stringify(deliveryPayload);
    const signature = endpoint.signatureScheme === SignatureScheme.ED25519
      ? SignatureUtil.generateEd25519(payloadStr, endpoint.secret)
      : SignatureUtil.generate(payloadStr, endpoint.secret);

    const start = Date.now();
    const axiosConfig = await this.buildAxiosConfig(
      endpoint,
      event,
      payloadStr,
      signature,
      deliveryPayload,
    );

    const isCanary =
      endpoint.canaryPercent > 0 &&
      endpoint.canaryUrl &&
      Math.random() * 100 < endpoint.canaryPercent;
    const targetUrl = isCanary ? endpoint.canaryUrl! : endpoint.url;

    let safe: { url: URL; ip: string; family: 4 | 6 };
    try {
      safe = await assertSafeUrl(targetUrl);
    } catch (err: any) {
      const ssrf = err instanceof SsrfBlocked ? err.message : `URL validation failed: ${err?.message || err}`;
      await this.handleDeliveryFailure(event, endpoint, { message: ssrf, isAxiosError: false }, 0);
      return;
    }
    const pinnedAgent = buildPinnedAgent(
      safe.url.protocol as 'http:' | 'https:',
      safe.ip,
      safe.family,

      endpoint.authType === EndpointAuthType.MTLS && endpoint.mtlsConfig
        ? { cert: endpoint.mtlsConfig.certificate, key: endpoint.mtlsConfig.privateKey, ca: endpoint.mtlsConfig.caCertificate || undefined, rejectUnauthorized: true }
        : {},
    );
    const configForDelivery: AxiosRequestConfig = {
      ...axiosConfig,
      url: targetUrl,
      maxRedirects: 0,
      httpAgent:  safe.url.protocol === 'http:'  ? pinnedAgent : undefined,
      httpsAgent: safe.url.protocol === 'https:' ? pinnedAgent : undefined,

      maxContentLength: 2 * 1024 * 1024,
      maxBodyLength:    Math.min(endpoint.maxPayloadBytes || 2 * 1024 * 1024, 10 * 1024 * 1024),
    };

    const deliveryFn = () =>
      axios({ ...configForDelivery, validateStatus: () => true });

    try {
      const response = await breaker.fire(deliveryFn);
      const latencyMs = Date.now() - start;
      const success = response.status >= 200 && response.status < 300;

      const responseHeaders: Record<string, string> = {};
      if (response.headers) {
        for (const [k, v] of Object.entries(response.headers)) {
          responseHeaders[k] = String(v);
        }
      }
      const responseBody = JSON.stringify(response.data).slice(0, 500);

      const successLog = {
        eventId: event.id,
        endpointId: endpoint.id,
        projectId: event.projectId,
        attempt: event.retryCount + 1,
        success,
        statusCode: response.status,
        responseBody,
        responseHeaders,
        latencyMs,
        attemptedAt: new Date(),
        isCanary,

        requestId: (event as any).requestId ?? null,
      };

      if (this.logWriter) this.logWriter.enqueue(successLog as any);
      else await this.logModel.create(successLog);

      if (success) {

        if (isCanary) {
          await this.endpointModel.findByIdAndUpdate(endpoint.id, {
            $inc: { canaryDelivered: 1 },
          });
        }

        await this.eventModel.findByIdAndUpdate(event.id, {
          status: EventStatus.DELIVERED,
          deliveredAt: new Date(),
          lastAttemptAt: new Date(),
          lastResponse: {
            statusCode: response.status,
            body: responseBody,
            headers: responseHeaders,
            durationMs: latencyMs,
          },
        });
        await this.endpointModel.findByIdAndUpdate(endpoint.id, {
          failureCount: 0,
          lastSuccessAt: new Date(),
          $inc: { totalDelivered: 1 },
        });

        if (this.sharedBreaker) {
          this.sharedBreaker.recordSuccess(endpoint.id).catch(() => {});
        }
        await this.analytics.record({
          projectId: event.projectId,
          endpointId: endpoint.id,
          metric: 'delivered',
          latencyMs,
          statusCode: response.status,
          eventType: event.eventType,
        });
        this.metrics.webhooksDelivered.inc({
          project_id: event.projectId,
          endpoint_id: endpoint.id,
          event_type: event.eventType,
        });
        this.metrics.deliveryDuration.observe(
          {
            project_id: event.projectId,
            endpoint_id: endpoint.id,
            status: 'success',
          },
          latencyMs,
        );
        this.logger.log(
          `Delivered ${event.id} → ${targetUrl} [${response.status}] in ${latencyMs}ms`,
        );

        this.realtime.notifyDeliverySuccess({
          projectId: event.projectId,
          endpointId: endpoint.id,
          eventId: event.id,
          eventType: event.eventType,
          statusCode: response.status,
          latencyMs,
        });

        if (endpoint.shadowUrl) {
          (async () => {
            try {
              const shadowSafe = await assertSafeUrl(endpoint.shadowUrl!);
              const shadowAgent = buildPinnedAgent(shadowSafe.url.protocol as 'http:' | 'https:', shadowSafe.ip, shadowSafe.family);
              await axios.post(endpoint.shadowUrl!, deliveryPayload, {
                timeout: 5000,
                maxRedirects: 0,
                httpAgent:  shadowSafe.url.protocol === 'http:'  ? shadowAgent : undefined,
                httpsAgent: shadowSafe.url.protocol === 'https:' ? shadowAgent : undefined,
                headers: { 'Content-Type': 'application/json', 'X-Shadow-Delivery': 'true', ...endpoint.headers },
              });
            } catch (err: any) {
              this.logger.debug(`Shadow delivery skipped: ${err?.message || err}`);
            }
          })();
        }
      } else {

        if (isCanary) {
          await this.endpointModel.findByIdAndUpdate(endpoint.id, {
            $inc: { canaryFailed: 1 },
          });
        }
        throw { response, message: `HTTP ${response.status}`, isAxiosError: false };
      }
    } catch (err: any) {
      await this.handleDeliveryFailure(event, endpoint, err, Date.now() - start);
    }
  }

  private async buildAxiosConfig(
    endpoint: Endpoint,
    event: WebhookEvent,
    payloadStr: string,
    signature: string,
    deliveryPayload: any,
  ): Promise<AxiosRequestConfig> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
      'X-Webhook-Event-Type': event.eventType,
      'X-Webhook-Event-Id': String(event._id),
      'X-Webhook-Attempt': String(event.retryCount + 1),
      'X-Webhook-Project-Id': event.projectId,
      ...endpoint.headers,
    };

    const config: AxiosRequestConfig = {
      method: 'POST',
      url: endpoint.url,
      data: deliveryPayload,
      timeout: endpoint.timeoutMs,
      headers,
    };

    switch (endpoint.authType) {
      case EndpointAuthType.BEARER_TOKEN:
        if (endpoint.bearerToken) headers['Authorization'] = `Bearer ${endpoint.bearerToken}`;
        break;

      case EndpointAuthType.OAUTH2:
        if (endpoint.oauth2Config) {
          const token = await this.getOAuth2Token(endpoint.id, endpoint.oauth2Config);
          headers['Authorization'] = `Bearer ${token}`;
        }
        break;

      case EndpointAuthType.MTLS:
        if (endpoint.mtlsConfig) {
          config.httpsAgent = new https.Agent({
            cert: endpoint.mtlsConfig.certificate,
            key: endpoint.mtlsConfig.privateKey,
            ca: endpoint.mtlsConfig.caCertificate || undefined,
            rejectUnauthorized: true,
          });
        }
        break;
    }

    return config;
  }

  private async getOAuth2Token(endpointId: string, cfg: { tokenUrl: string; clientId: string; clientSecret: string; scope?: string; audience?: string }): Promise<string> {
    const cached = oauth2TokenCache.get(endpointId);
    if (cached && Date.now() < cached.expiresAt) return cached.token;

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      ...(cfg.scope ? { scope: cfg.scope } : {}),
      ...(cfg.audience ? { audience: cfg.audience } : {}),
    });

    const res = await axios.post(cfg.tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000,
    });

    const token = res.data.access_token;
    const expiresIn = (res.data.expires_in || 3600) * 1000;
    oauth2TokenCache.set(endpointId, { token, expiresAt: Date.now() + expiresIn - 60_000 });
    return token;
  }

  private async deliverToS3(event: WebhookEvent, endpoint: Endpoint): Promise<void> {
    // @ts-ignore - optional peer dep
    const { S3Client, PutObjectCommand } = await (import('@aws-sdk/client-s3') as Promise<any>).catch(() => { throw new Error('@aws-sdk/client-s3 not installed. Run: npm install @aws-sdk/client-s3'); });
    const cfg = endpoint.storageConfig!;
    const s3 = new S3Client({ region: cfg.region || 'us-east-1', credentials: cfg.accessKeyId ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey! } : undefined });
    const key = `${cfg.prefix || 'webhooks'}/${event.projectId}/${event.eventType}/${event.id}.json`;
    await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: JSON.stringify(event.payload), ContentType: 'application/json', Metadata: { eventId: event.id, eventType: event.eventType, projectId: event.projectId } }));
    await this.eventModel.findByIdAndUpdate(event.id, { status: EventStatus.DELIVERED, deliveredAt: new Date(), lastAttemptAt: new Date(), lastResponse: { statusCode: 200, body: `s3://${cfg.bucket}/${key}`, headers: null, durationMs: 0 } });
    await this.endpointModel.findByIdAndUpdate(endpoint.id, { $inc: { totalDelivered: 1 }, lastSuccessAt: new Date() });
    this.logger.log(`S3 delivery: ${event.id} → s3://${cfg.bucket}/${key}`);
  }

  private async deliverToGcs(event: WebhookEvent, endpoint: Endpoint): Promise<void> {
    // @ts-ignore - optional peer dep
    const { Storage } = await (import('@google-cloud/storage') as Promise<any>).catch(() => { throw new Error('@google-cloud/storage not installed. Run: npm install @google-cloud/storage'); });
    const cfg = endpoint.storageConfig!;
    const credentials = cfg.serviceAccountKey ? JSON.parse(cfg.serviceAccountKey) : undefined;
    const storage = new Storage({ credentials });
    const key = `${cfg.prefix || 'webhooks'}/${event.projectId}/${event.eventType}/${event.id}.json`;
    const bucket = storage.bucket(cfg.bucket);
    await bucket.file(key).save(JSON.stringify(event.payload), { contentType: 'application/json' });
    await this.eventModel.findByIdAndUpdate(event.id, { status: EventStatus.DELIVERED, deliveredAt: new Date(), lastAttemptAt: new Date(), lastResponse: { statusCode: 200, body: `gs://${cfg.bucket}/${key}`, headers: null, durationMs: 0 } });
    await this.endpointModel.findByIdAndUpdate(endpoint.id, { $inc: { totalDelivered: 1 }, lastSuccessAt: new Date() });
    this.logger.log(`GCS delivery: ${event.id} → gs://${cfg.bucket}/${key}`);
  }

  private async handleDeliveryFailure(
    event: WebhookEvent,
    endpoint: Endpoint,
    err: any,
    latencyMs: number,
  ) {
    const statusCode = err.response?.status;
    const errorMessage = err.message;
    const newRetryCount = event.retryCount + 1;
    const responseHeaders: Record<string, string> = {};
    if (err.response?.headers) {
      for (const [k, v] of Object.entries(err.response.headers)) {
        responseHeaders[k] = String(v);
      }
    }
    const responseBody = err.response?.data
      ? JSON.stringify(err.response.data).slice(0, 500)
      : null;

    const failureLog = {
      eventId: event.id,
      endpointId: endpoint.id,
      projectId: event.projectId,
      attempt: newRetryCount,
      success: false,
      statusCode,
      responseBody,
      responseHeaders: Object.keys(responseHeaders).length ? responseHeaders : null,
      latencyMs,
      errorMessage,
      attemptedAt: new Date(),
      requestId: (event as any).requestId ?? null,
    };
    if (this.logWriter) this.logWriter.enqueue(failureLog as any);
    else await this.logModel.create(failureLog);

    await this.endpointModel.findByIdAndUpdate(endpoint.id, {
      $inc: { failureCount: 1, totalFailed: 1 },
      lastFailureAt: new Date(),
    });

    if (this.sharedBreaker) {
      this.sharedBreaker.recordFailure(endpoint.id).catch(() => {});
    }

    const lastResponse = {
      statusCode: statusCode ?? null,
      body: responseBody ?? null,
      headers: Object.keys(responseHeaders).length ? responseHeaders : null,
      durationMs: latencyMs,
    };

    await this.analytics.record({
      projectId: event.projectId,
      endpointId: endpoint.id,
      metric: 'failed',
      latencyMs,
      statusCode,
      eventType: event.eventType,
    });
    this.metrics.webhooksFailed.inc({
      project_id: event.projectId,
      endpoint_id: endpoint.id,
      event_type: event.eventType,
      status_code: String(statusCode || 'unknown'),
    });

    this.metrics.deliveryDuration.observe(
      {
        project_id: event.projectId,
        endpoint_id: endpoint.id,
        status: 'failure',
      },
      latencyMs,
    );

    const maxRetries = endpoint.maxRetries || MAX_RETRY_ATTEMPTS;

    if (newRetryCount >= maxRetries) {
      await this.eventModel.findByIdAndUpdate(event.id, {
        status: EventStatus.DEAD,
        retryCount: newRetryCount,
        lastAttemptAt: new Date(),
        deadAt: new Date(),
        lastError: { message: errorMessage, statusCode },
        lastResponse,
      });
      await this.dlqQueue.add({ eventId: event.id, endpointId: endpoint.id });
      await this.analytics.record({
        projectId: event.projectId,
        endpointId: endpoint.id,
        metric: 'dead',
      });
      this.metrics.webhooksDead.inc({
        project_id: event.projectId,
        endpoint_id: endpoint.id,
      });
      await this.notifications.notifyEndpointDown(
        endpoint.name,
        endpoint.url,
        errorMessage,
      );
      this.realtime.notifyDeliveryDead({
        projectId: event.projectId,
        endpointId: endpoint.id,
        eventId: event.id,
        eventType: event.eventType,
        retryCount: newRetryCount,
        errorMessage,
      });
      this.logger.warn(`Event ${event.id} → DLQ after ${newRetryCount} attempts`);
    } else {

      const nextRetryAt = getNextRetryAtForStrategy(
        newRetryCount,
        endpoint.retryStrategy || 'exponential',
        endpoint.retryFixedDelaySeconds || 60,
      );
      await this.eventModel.findByIdAndUpdate(event.id, {
        status: EventStatus.RETRYING,
        retryCount: newRetryCount,
        lastAttemptAt: new Date(),
        nextRetryAt,
        lastError: { message: errorMessage, statusCode },
        lastResponse,
      });
      await this.scheduleRetry(event, newRetryCount);

      this.realtime.notifyDeliveryFailed({
        projectId: event.projectId,
        endpointId: endpoint.id,
        eventId: event.id,
        eventType: event.eventType,
        statusCode,
        errorMessage,
        retryCount: newRetryCount,
        nextRetryAt,
      });
    }
  }

  async replay(eventId: string): Promise<void> {
    const event = await this.eventModel.findByIdAndUpdate(eventId, { status: EventStatus.PENDING, retryCount: 0, nextRetryAt: null, lastError: null }, { new: true });
    if (!event) throw new Error(`Event ${eventId} not found`);
    await this.webhookQueue.add(
      'deliver',
      { eventId },
      { attempts: 1, jobId: `replay-${eventId}-${Date.now()}` },
    );
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
      const breaker = new CircuitBreaker(async (fn: any) => fn(), { timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '10000'), errorThresholdPercentage: 50, resetTimeout: 30000, volumeThreshold: 5 });
      breaker.on('open', () => { this.logger.warn(`Circuit OPEN for ${endpointId}`); this.metrics.circuitBreakersOpen.inc(); this.notifications.notifyCircuitOpen(endpointId, '').catch(() => {}); });
      breaker.on('close', () => { this.logger.log(`Circuit CLOSED for ${endpointId}`); this.metrics.circuitBreakersOpen.dec(); });
      this.breakers.set(endpointId, breaker);
    }
    return this.breakers.get(endpointId)!;
  }

  private async scheduleRetry(
    event: WebhookEvent,
    retryCount?: number,
  ): Promise<void> {
    const count = retryCount ?? event.retryCount;
    const nextRetryAt = getNextRetryAt(count);
    if (!nextRetryAt) return;
    const delay = nextRetryAt.getTime() - Date.now();
    await this.webhookQueue.add(
      'deliver',
      { eventId: event.id },
      {
        delay,
        attempts: 1,
        jobId: `retry-${event.id}-${count}`,
      },
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanExpiredEvents(): Promise<void> {
    const now = new Date();
    const expired = await this.eventModel.find({
      expiresAt: { $lt: now },
      status: { $in: [EventStatus.PENDING, EventStatus.RETRYING] },
    });

    for (const event of expired) {
      await this.eventModel.findByIdAndUpdate(event.id, {
        status: EventStatus.DEAD,
        deadAt: now,
        lastError: { message: 'TTL_EXCEEDED' },
      });
    }

    if (expired.length > 0) {
      this.logger.log(`Cleaned up ${expired.length} expired events`);
    }
  }
}
