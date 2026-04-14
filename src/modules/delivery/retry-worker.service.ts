import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Model } from 'mongoose';
import { Queue } from 'bull';
import { WebhookEvent, EventStatus } from '../events/schemas/event.schema';
import { Project } from '../projects/schemas/project.schema';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

@Injectable()
export class RetryWorkerService {
  private readonly logger = new Logger(RetryWorkerService.name);

  constructor(
    @InjectModel(WebhookEvent.name) private eventModel: Model<WebhookEvent>,
    @InjectModel(Project.name) private projectModel: Model<Project>,
    @InjectQueue(WEBHOOK_QUEUE) private webhookQueue: Queue,
    private metricsService: MetricsService,
    private notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async rescheduleFailedEvents() {
    const now = new Date();
    const events = await this.eventModel.find({
      status: { $in: [EventStatus.FAILED, EventStatus.RATE_QUEUED] },
      nextRetryAt: { $lte: now },
    }).limit(100).exec();

    if (events.length === 0) return;

    this.logger.log(`🔁 Retry worker: rescheduling ${events.length} events`);

    for (const event of events) {
      await this.webhookQueue.add(
        { eventId: event.id },
        { attempts: 1, jobId: `reschedule-${event.id}-${Date.now()}` },
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async updateDlqMetrics() {
    const dlqCount = await this.eventModel.countDocuments({ status: EventStatus.DEAD });
    this.metricsService.dlqSize.set(dlqCount);
    this.logger.log(`📊 DLQ size updated: ${dlqCount}`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async alertOnHighDlq() {
    const dlqCount = await this.eventModel.countDocuments({ status: EventStatus.DEAD });
    if (dlqCount > 100) {
      await this.notificationsService.sendAlert({
        level: 'warning',
        title: 'High DLQ count',
        message: `${dlqCount} events in Dead Letter Queue require attention`,
      });
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async resetMonthlyCounters() {
    const now = new Date();
    const result = await this.projectModel.updateMany(
      { usageResetAt: { $lte: now } },
      {
        currentMonthEvents: 0,
        usageResetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      },
    );
    this.logger.log(`📅 Reset monthly counters for ${result.modifiedCount} projects`);
  }

  @Cron('*/5 * * * *')
  async logQueueHealth() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.webhookQueue.getWaitingCount(),
      this.webhookQueue.getActiveCount(),
      this.webhookQueue.getCompletedCount(),
      this.webhookQueue.getFailedCount(),
    ]);

    this.metricsService.queueSize.set(waiting + active);

    this.logger.log(
      `📬 Queue health — waiting: ${waiting}, active: ${active}, completed: ${completed}, failed: ${failed}`,
    );
  }

  @Cron('0 3 * * *')
  async cleanOldJobs() {
    await this.webhookQueue.clean(7 * 24 * 3600 * 1000, 'completed');
    await this.webhookQueue.clean(30 * 24 * 3600 * 1000, 'failed');
    this.logger.log('🧹 Cleaned old queue jobs');
  }

  @Cron('0 2 * * *')
  async purgeOldDlqEvents() {
    const retentionDays = parseInt(process.env.DLQ_RETENTION_DAYS || '90', 10);
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const { deletedCount } = await this.eventModel.deleteMany({
      status: EventStatus.DEAD,
      deadAt: { $lt: cutoff },
    });
    if (deletedCount) this.logger.log(`🗑️  Purged ${deletedCount} DLQ events older than ${retentionDays}d`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async backlogGuardrail() {
    const waiting = await this.webhookQueue.getWaitingCount();
    const threshold = parseInt(process.env.QUEUE_BACKLOG_WARN || '100000', 10);
    if (waiting >= threshold) {
      this.logger.warn(`🚨 Queue backlog ${waiting} ≥ ${threshold} — consider scaling workers`);
      await this.notificationsService.sendAlert({
        level: 'warning',
        title: 'Webhook queue backlog high',
        message: `${waiting} jobs waiting (threshold ${threshold}).`,
      }).catch(() => {});
    }
  }
}
