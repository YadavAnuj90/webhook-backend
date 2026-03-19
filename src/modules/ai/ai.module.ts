import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiProviderService } from './gemini.service';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { WebhookEvent, WebhookEventSchema } from '../events/schemas/event.schema';
import { DeliveryLog, DeliveryLogSchema } from '../delivery/schemas/delivery-log.schema';
import { Endpoint, EndpointSchema } from '../endpoints/schemas/endpoint.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookEvent.name, schema: WebhookEventSchema },
      { name: DeliveryLog.name,  schema: DeliveryLogSchema  },
      { name: Endpoint.name,     schema: EndpointSchema     },
    ]),
  ],
  controllers: [AiController],
  providers: [AiProviderService, AiService],
  exports: [AiProviderService, AiService],
})
export class AiModule {}
