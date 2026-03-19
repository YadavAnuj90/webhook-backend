import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { WebhookEvent, WebhookEventSchema } from './schemas/event.schema';
import { DeliveryLog, DeliveryLogSchema } from '../delivery/schemas/delivery-log.schema';
import { Endpoint, EndpointSchema } from '../endpoints/schemas/endpoint.schema';
import { EventType, EventTypeSchema } from '../event-catalog/schemas/event-type.schema';
import { Subscription, SubscriptionSchema } from '../billing/schemas/subscription.schema';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { DeduplicationModule } from '../deduplication/deduplication.module';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookEvent.name, schema: WebhookEventSchema },
      { name: DeliveryLog.name, schema: DeliveryLogSchema },
      { name: Endpoint.name, schema: EndpointSchema },
      { name: EventType.name, schema: EventTypeSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
    DeduplicationModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [MongooseModule, EventsService],
})
export class EventsModule {}
