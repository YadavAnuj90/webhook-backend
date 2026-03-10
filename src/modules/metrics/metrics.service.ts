import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private registry: client.Registry;

  // ─── Counters ─────────────────────────────────────────────────────────────
  public webhooksDelivered: client.Counter<string>;
  public webhooksFailed: client.Counter<string>;
  public webhooksDead: client.Counter<string>;
  public webhooksFiltered: client.Counter<string>;
  public webhooksRateLimited: client.Counter<string>;
  public webhooksReplayed: client.Counter<string>;

  // ─── Histograms ───────────────────────────────────────────────────────────
  public deliveryDuration: client.Histogram<string>;
  public httpRequestDuration: client.Histogram<string>;

  // ─── Gauges ───────────────────────────────────────────────────────────────
  public queueSize: client.Gauge<string>;
  public dlqSize: client.Gauge<string>;
  public activeEndpoints: client.Gauge<string>;
  public circuitBreakersOpen: client.Gauge<string>;

  // ─── Summaries ────────────────────────────────────────────────────────────
  public retryAttempts: client.Summary<string>;

  onModuleInit() {
    this.registry = new client.Registry();
    this.registry.setDefaultLabels({ app: 'webhook-os', version: '2.0.0' });
    client.collectDefaultMetrics({ register: this.registry });

    const prefix = process.env.METRICS_PREFIX || 'webhook_';

    this.webhooksDelivered = new client.Counter({
      name: `${prefix}delivered_total`,
      help: 'Total webhook events successfully delivered',
      labelNames: ['project_id', 'endpoint_id', 'event_type'],
      registers: [this.registry],
    });

    this.webhooksFailed = new client.Counter({
      name: `${prefix}failed_total`,
      help: 'Total webhook delivery failures',
      labelNames: ['project_id', 'endpoint_id', 'event_type', 'status_code'],
      registers: [this.registry],
    });

    this.webhooksDead = new client.Counter({
      name: `${prefix}dead_total`,
      help: 'Total webhook events moved to DLQ',
      labelNames: ['project_id', 'endpoint_id'],
      registers: [this.registry],
    });

    this.webhooksFiltered = new client.Counter({
      name: `${prefix}filtered_total`,
      help: 'Total events blocked by filter rules',
      labelNames: ['project_id', 'endpoint_id'],
      registers: [this.registry],
    });

    this.webhooksRateLimited = new client.Counter({
      name: `${prefix}rate_limited_total`,
      help: 'Total events blocked by rate limiting',
      labelNames: ['project_id', 'endpoint_id'],
      registers: [this.registry],
    });

    this.webhooksReplayed = new client.Counter({
      name: `${prefix}replayed_total`,
      help: 'Total events manually replayed',
      labelNames: ['project_id'],
      registers: [this.registry],
    });

    this.deliveryDuration = new client.Histogram({
      name: `${prefix}delivery_duration_ms`,
      help: 'Webhook delivery latency in milliseconds',
      labelNames: ['project_id', 'endpoint_id', 'status'],
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
      registers: [this.registry],
    });

    this.httpRequestDuration = new client.Histogram({
      name: `${prefix}http_request_duration_ms`,
      help: 'HTTP request duration in milliseconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.registry],
    });

    this.queueSize = new client.Gauge({
      name: `${prefix}queue_size`,
      help: 'Current number of jobs in delivery queue',
      registers: [this.registry],
    });

    this.dlqSize = new client.Gauge({
      name: `${prefix}dlq_size`,
      help: 'Current number of events in Dead Letter Queue',
      registers: [this.registry],
    });

    this.activeEndpoints = new client.Gauge({
      name: `${prefix}active_endpoints`,
      help: 'Number of active webhook endpoints',
      labelNames: ['project_id'],
      registers: [this.registry],
    });

    this.circuitBreakersOpen = new client.Gauge({
      name: `${prefix}circuit_breakers_open`,
      help: 'Number of circuit breakers currently open',
      registers: [this.registry],
    });

    this.retryAttempts = new client.Summary({
      name: `${prefix}retry_attempts`,
      help: 'Distribution of retry attempt counts',
      labelNames: ['project_id'],
      percentiles: [0.5, 0.9, 0.95, 0.99],
      registers: [this.registry],
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return client.register.contentType;
  }
}
