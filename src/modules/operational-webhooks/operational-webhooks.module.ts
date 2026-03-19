import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OperationalWebhook, OperationalWebhookSchema } from './schemas/operational-webhook.schema';
import { OperationalWebhooksService } from './operational-webhooks.service';
import { OperationalWebhooksController } from './operational-webhooks.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: OperationalWebhook.name, schema: OperationalWebhookSchema }])],
  controllers: [OperationalWebhooksController],
  providers: [OperationalWebhooksService],
  exports: [OperationalWebhooksService],
})
export class OperationalWebhooksModule {}
