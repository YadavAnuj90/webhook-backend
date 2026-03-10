import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Endpoint, EndpointSchema } from '../endpoints/schemas/endpoint.schema';
import { WebhookEvent, WebhookEventSchema } from '../events/schemas/event.schema';
import { AuditLog, AuditLogSchema } from '../audit/schemas/audit-log.schema';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Endpoint.name, schema: EndpointSchema },
      { name: WebhookEvent.name, schema: WebhookEventSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
