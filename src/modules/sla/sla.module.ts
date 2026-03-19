import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { SlaMonitorService } from './sla-monitor.service';
import { WebhookEvent, WebhookEventSchema } from '../events/schemas/event.schema';
import { EventType, EventTypeSchema } from '../event-catalog/schemas/event-type.schema';
import { OperationalWebhooksModule } from '../operational-webhooks/operational-webhooks.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookEvent.name, schema: WebhookEventSchema },
      { name: EventType.name, schema: EventTypeSchema },
    ]),
    OperationalWebhooksModule,
  ],
  providers: [SlaMonitorService],
  exports: [SlaMonitorService],
})
export class SlaModule {}
