import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { WebhookEvent, WebhookEventSchema } from '../events/schemas/event.schema';
import { Endpoint, EndpointSchema } from '../endpoints/schemas/endpoint.schema';
import { DeliveryModule } from '../delivery/delivery.module';
import { ProjectsModule } from '../projects/projects.module';
import { WebhooksController } from './webhooks.controller';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookEvent.name, schema: WebhookEventSchema },
      { name: Endpoint.name, schema: EndpointSchema },
    ]),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
    DeliveryModule,
    ProjectsModule,
  ],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
