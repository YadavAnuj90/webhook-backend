import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { DeliveryService } from './delivery.service';
import { RetryWorkerService } from './retry-worker.service';
import { DeliveryLog, DeliveryLogSchema } from './schemas/delivery-log.schema';
import { WebhookEvent, WebhookEventSchema } from '../events/schemas/event.schema';
import { Endpoint, EndpointSchema } from '../endpoints/schemas/endpoint.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { EndpointsModule } from '../endpoints/endpoints.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { FilterEngineService } from '../../utils/filter-engine.service';
import { WEBHOOK_QUEUE, DEAD_LETTER_QUEUE } from '../../queue/queue.constants';
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

@Processor(WEBHOOK_QUEUE)
export class WebhookQueueProcessor {
  private readonly logger = new Logger(WebhookQueueProcessor.name);
  constructor(private deliveryService: DeliveryService) {}

  @Process({ name: 'deliver', concurrency: 10 })
  async handleDelivery(job: Job<{ eventId: string }>) {
    await this.deliveryService.deliver(job.data.eventId);
  }

  // Fallback for unnamed jobs
  @Process({ concurrency: 5 })
  async handleDefault(job: Job<{ eventId: string }>) {
    if (job.data?.eventId) await this.deliveryService.deliver(job.data.eventId);
  }
}

@Processor(DEAD_LETTER_QUEUE)
export class DlqProcessor {
  private readonly logger = new Logger(DlqProcessor.name);
  @Process()
  async handleDlq(job: Job<{ eventId: string; endpointId: string }>) {
    this.logger.error(`💀 DLQ: ${job.data.eventId} for endpoint ${job.data.endpointId}`);
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeliveryLog.name, schema: DeliveryLogSchema },
      { name: WebhookEvent.name, schema: WebhookEventSchema },
      { name: Endpoint.name, schema: EndpointSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
    BullModule.registerQueue(
      { name: WEBHOOK_QUEUE },
      { name: DEAD_LETTER_QUEUE },
    ),
    EndpointsModule,
    AnalyticsModule,
    MetricsModule,
    NotificationsModule,
    RealtimeModule,
  ],
  providers: [
    DeliveryService,
    RetryWorkerService,
    FilterEngineService,
    WebhookQueueProcessor,
    DlqProcessor,
  ],
  exports: [DeliveryService],
})
export class DeliveryModule {}
