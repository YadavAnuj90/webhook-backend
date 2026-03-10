import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { WebhookEvent, WebhookEventSchema } from './schemas/event.schema';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WebhookEvent.name, schema: WebhookEventSchema }]),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [MongooseModule, EventsService],
})
export class EventsModule {}
