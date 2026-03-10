import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface AlertPayload {
  level: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private config: ConfigService) {}

  async sendAlert(alert: AlertPayload): Promise<void> {
    await Promise.allSettled([
      this.sendSlack(alert),
      // this.sendEmail(alert), // plug in SendGrid/SES when ready
    ]);
  }

  async notifyEndpointDown(endpointName: string, url: string, reason: string): Promise<void> {
    await this.sendAlert({
      level: 'error',
      title: `🔴 Endpoint Down: ${endpointName}`,
      message: `Delivery to ${url} has permanently failed.\nReason: ${reason}`,
      metadata: { url, reason },
    });
  }

  async notifyCircuitOpen(endpointName: string, url: string): Promise<void> {
    await this.sendAlert({
      level: 'warning',
      title: `⚡ Circuit Breaker Opened: ${endpointName}`,
      message: `Deliveries to ${url} paused. Too many failures detected.`,
    });
  }

  private async sendSlack(alert: AlertPayload): Promise<void> {
    const webhookUrl = this.config.get<string>('SLACK_WEBHOOK_URL');
    if (!webhookUrl) return;

    const color = { info: '#6366f1', warning: '#f59e0b', error: '#ef4444' }[alert.level];

    try {
      await axios.post(webhookUrl, {
        attachments: [{
          color,
          title: alert.title,
          text: alert.message,
          footer: 'WebhookOS v2',
          ts: Math.floor(Date.now() / 1000),
          fields: alert.metadata
            ? Object.entries(alert.metadata).map(([k, v]) => ({ title: k, value: String(v), short: true }))
            : [],
        }],
      });
    } catch (err) {
      this.logger.error('Failed to send Slack alert', err.message);
    }
  }
}
