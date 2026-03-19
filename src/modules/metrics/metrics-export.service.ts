import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { MetricsService } from './metrics.service';

interface MetricPoint {
  metric: string;
  points: [[number, number]]; // [timestamp, value]
  type: 'count' | 'gauge' | 'rate';
  tags?: string[];
}

@Injectable()
export class MetricsExportService {
  private readonly logger = new Logger(MetricsExportService.name);
  private ddApiKey: string | undefined;
  private nrApiKey: string | undefined;
  private nrAccountId: string | undefined;

  constructor(
    private config: ConfigService,
    private metrics: MetricsService,
  ) {
    this.ddApiKey = config.get('DATADOG_API_KEY');
    this.nrApiKey = config.get('NEW_RELIC_API_KEY');
    this.nrAccountId = config.get('NEW_RELIC_ACCOUNT_ID');
  }

  /** Push metrics to Datadog every 60 seconds */
  @Cron(CronExpression.EVERY_MINUTE)
  async exportToDatadog() {
    if (!this.ddApiKey) return;
    try {
      const now = Math.floor(Date.now() / 1000);
      const prometheusText = await this.metrics.getMetrics();
      const points = this.parsePrometheusToDatadog(prometheusText, now);
      if (!points.length) return;
      await axios.post(
        'https://api.datadoghq.com/api/v1/series',
        { series: points },
        {
          headers: {
            'Content-Type': 'application/json',
            'DD-API-KEY': this.ddApiKey,
          },
          timeout: 10_000,
        },
      );
      this.logger.debug(`📊 Exported ${points.length} metrics to Datadog`);
    } catch (e: any) {
      this.logger.warn(`⚠️  Datadog export failed: ${e.message}`);
    }
  }

  /** Push metrics to New Relic every 60 seconds */
  @Cron(CronExpression.EVERY_MINUTE)
  async exportToNewRelic() {
    if (!this.nrApiKey || !this.nrAccountId) return;
    try {
      const now = Date.now();
      const prometheusText = await this.metrics.getMetrics();
      const nrMetrics = this.parsePrometheusToNewRelic(prometheusText, now);
      if (!nrMetrics.length) return;
      await axios.post(
        `https://metric-api.newrelic.com/metric/v1`,
        [{ metrics: nrMetrics }],
        {
          headers: {
            'Content-Type': 'application/json',
            'Api-Key': this.nrApiKey,
          },
          timeout: 10_000,
        },
      );
      this.logger.debug(`📊 Exported ${nrMetrics.length} metrics to New Relic`);
    } catch (e: any) {
      this.logger.warn(`⚠️  New Relic export failed: ${e.message}`);
    }
  }

  private parsePrometheusToDatadog(text: string, now: number): MetricPoint[] {
    const points: MetricPoint[] = [];
    for (const line of text.split('\n')) {
      if (line.startsWith('#') || !line.trim()) continue;
      const match = line.match(/^(\S+?)(\{[^}]*\})?\s+([\d.e+\-]+)$/);
      if (!match) continue;
      const [, name, labelsStr, valueStr] = match;
      const value = parseFloat(valueStr);
      if (isNaN(value)) continue;
      const tags: string[] = [];
      if (labelsStr) {
        for (const lm of labelsStr.matchAll(/(\w+)="([^"]*)"/g)) {
          tags.push(`${lm[1]}:${lm[2]}`);
        }
      }
      points.push({
        metric: `webhookos.${name.replace(/_/g, '.')}`,
        points: [[now, value]],
        type: name.includes('total') ? 'count' : 'gauge',
        tags,
      });
    }
    return points;
  }

  private parsePrometheusToNewRelic(text: string, now: number): any[] {
    const metrics: any[] = [];
    for (const line of text.split('\n')) {
      if (line.startsWith('#') || !line.trim()) continue;
      const match = line.match(/^(\S+?)(\{[^}]*\})?\s+([\d.e+\-]+)$/);
      if (!match) continue;
      const [, name, labelsStr, valueStr] = match;
      const value = parseFloat(valueStr);
      if (isNaN(value)) continue;
      const attributes: Record<string, string> = { app: 'webhookos' };
      if (labelsStr) {
        for (const lm of labelsStr.matchAll(/(\w+)="([^"]*)"/g)) {
          attributes[lm[1]] = lm[2];
        }
      }
      metrics.push({
        name: `webhookos.${name}`,
        type: name.includes('total') ? 'count' : 'gauge',
        value,
        timestamp: now,
        attributes,
      });
    }
    return metrics;
  }
}
