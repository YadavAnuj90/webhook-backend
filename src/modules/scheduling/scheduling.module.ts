import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { SchedulingService } from './scheduling.service';
import { SchedulingController } from './scheduling.controller';
import { ScheduledEvent, ScheduledEventSchema } from './schemas/scheduled-event.schema';
import { WebhookEvent, WebhookEventSchema } from '../events/schemas/event.schema';
import { Endpoint, EndpointSchema } from '../endpoints/schemas/endpoint.schema';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScheduledEvent.name, schema: ScheduledEventSchema },
      { name: WebhookEvent.name, schema: WebhookEventSchema },
      { name: Endpoint.name, schema: EndpointSchema },
    ]),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
  ],
  controllers: [SchedulingController],
  providers: [SchedulingService],
  exports: [SchedulingService],
})
export class SchedulingModule {}
