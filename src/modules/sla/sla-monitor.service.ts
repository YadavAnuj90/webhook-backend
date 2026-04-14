import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';

import { WebhookEvent, EventStatus } from '../events/schemas/event.schema';
import { EventType } from '../event-catalog/schemas/event-type.schema';
import { OperationalWebhooksService } from '../operational-webhooks/operational-webhooks.service';
import { OperationalEvent } from '../operational-webhooks/schemas/operational-webhook.schema';

@Injectable()
export class SlaMonitorService {
  private readonly logger = new Logger(SlaMonitorService.name);

  constructor(
    @InjectModel(WebhookEvent.name) private eventModel: Model<WebhookEvent>,
    @InjectModel(EventType.name) private eventTypeModel: Model<EventType>,
    private operationalWebhooksService: OperationalWebhooksService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkSlaBreaches(): Promise<void> {

    const eventTypes = await this.eventTypeModel.find({
      maxDeliverySeconds: { $gt: 0 },
    });

    for (const et of eventTypes) {
      const thresholdTime = new Date(
        Date.now() - et.maxDeliverySeconds * 1000,
      );

      const breaches = await this.eventModel.find({
        eventType: et.name,
        status: { $in: [EventStatus.PENDING, EventStatus.RETRYING] },
        createdAt: { $lt: thresholdTime },
      });

      for (const event of breaches) {
        const createdAtTime =
          (event as any).createdAt instanceof Date
            ? (event as any).createdAt.getTime()
            : new Date((event as any).createdAt).getTime();
        const ageSeconds = Math.floor(
          (Date.now() - createdAtTime) / 1000,
        );

        await this.operationalWebhooksService.fire(
          event.projectId,
          OperationalEvent.SLA_BREACH,
          {
            eventId: event._id,
            eventType: event.eventType,
            ageSeconds,
            maxDeliverySeconds: et.maxDeliverySeconds,
          },
        );

        this.logger.warn(
          `SLA breach: event ${event._id} (type: ${event.eventType}) exceeded ${et.maxDeliverySeconds}s`,
        );
      }
    }
  }
}
