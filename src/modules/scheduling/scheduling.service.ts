import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Queue } from 'bull';
import { ScheduledEvent, ScheduledEventStatus } from './schemas/scheduled-event.schema';
import { WebhookEvent } from '../events/schemas/event.schema';
import { Endpoint, EndpointStatus } from '../endpoints/schemas/endpoint.schema';
import { PayloadCrypto } from '../../utils/payload-crypto';
import { PiiScrubber } from '../../utils/pii-scrubber';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

/**
 * SchedulingService — delayed webhook delivery.
 *
 * Architecture:
 * - Users schedule events with a future `scheduledFor` timestamp
 * - Cron job runs every 30s to find due events
 * - Due events are converted to WebhookEvents and pushed to the normal delivery queue
 * - Supports cancel, reschedule, and list operations
 * - Max schedule window: 30 days in the future
 */
@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  /** Maximum seconds in the future an event can be scheduled */
  private readonly MAX_SCHEDULE_WINDOW_MS = 30 * 24 * 3600 * 1000; // 30 days

  constructor(
    @InjectModel(ScheduledEvent.name) private scheduledModel: Model<ScheduledEvent>,
    @InjectModel(WebhookEvent.name)   private eventModel: Model<WebhookEvent>,
    @InjectModel(Endpoint.name)       private endpointModel: Model<Endpoint>,
    @InjectQueue(WEBHOOK_QUEUE)       private webhookQueue: Queue,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  async schedule(
    projectId: string,
    dto: {
      endpointId: string;
      eventType: string;
      payload: any;
      scheduledFor: string;
      priority?: string;
      idempotencyKey?: string;
    },
    userId: string,
  ) {
    // Validate endpoint exists and belongs to project
    const endpoint = await this.endpointModel.findOne({
      _id: dto.endpointId,
      projectId,
    });
    if (!endpoint) throw new NotFoundException('Endpoint not found in this project');

    const scheduledFor = new Date(dto.scheduledFor);
    const now = new Date();

    if (scheduledFor <= now) {
      throw new BadRequestException('scheduledFor must be in the future');
    }
    if (scheduledFor.getTime() - now.getTime() > this.MAX_SCHEDULE_WINDOW_MS) {
      throw new BadRequestException('Cannot schedule more than 30 days in advance');
    }

    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.scheduledModel.findOne({
        projectId,
        endpointId: dto.endpointId,
        idempotencyKey: dto.idempotencyKey,
        status: { $ne: ScheduledEventStatus.CANCELLED },
      });
      if (existing) {
        return { id: existing.id, status: existing.status, duplicate: true };
      }
    }

    const scheduled = await this.scheduledModel.create({
      projectId,
      endpointId: dto.endpointId,
      eventType: dto.eventType,
      payload: dto.payload,
      scheduledFor,
      priority: dto.priority || 'p2',
      idempotencyKey: dto.idempotencyKey || null,
      createdBy: userId,
    });

    this.logger.log(
      `Scheduled event ${scheduled.id} for ${scheduledFor.toISOString()} → endpoint ${dto.endpointId}`,
    );

    return {
      id: scheduled.id,
      status: scheduled.status,
      scheduledFor: scheduled.scheduledFor,
    };
  }

  async findAll(
    projectId: string,
    page = 1,
    limit = 20,
    status?: ScheduledEventStatus,
  ) {
    const filter: any = { projectId };
    if (status) filter.status = status;
    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
      this.scheduledModel.find(filter).sort({ scheduledFor: 1 }).skip(skip).limit(limit),
      this.scheduledModel.countDocuments(filter),
    ]);
    return { events, total, page, limit };
  }

  async findOne(id: string, projectId: string) {
    const event = await this.scheduledModel.findOne({ _id: id, projectId });
    if (!event) throw new NotFoundException('Scheduled event not found');
    return event;
  }

  async update(
    id: string,
    projectId: string,
    dto: { payload?: any; scheduledFor?: string; priority?: string },
  ) {
    const event = await this.scheduledModel.findOne({ _id: id, projectId });
    if (!event) throw new NotFoundException('Scheduled event not found');
    if (event.status !== ScheduledEventStatus.PENDING) {
      throw new BadRequestException(`Cannot modify event in ${event.status} state`);
    }

    const updates: any = {};
    if (dto.payload) updates.payload = dto.payload;
    if (dto.priority) updates.priority = dto.priority;
    if (dto.scheduledFor) {
      const newTime = new Date(dto.scheduledFor);
      if (newTime <= new Date()) throw new BadRequestException('scheduledFor must be in the future');
      updates.scheduledFor = newTime;
    }

    return this.scheduledModel.findByIdAndUpdate(id, updates, { new: true });
  }

  async cancel(id: string, projectId: string, reason?: string) {
    const event = await this.scheduledModel.findOne({ _id: id, projectId });
    if (!event) throw new NotFoundException('Scheduled event not found');
    if (event.status !== ScheduledEventStatus.PENDING) {
      throw new BadRequestException(`Cannot cancel event in ${event.status} state`);
    }

    await this.scheduledModel.findByIdAndUpdate(id, {
      status: ScheduledEventStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelReason: reason || null,
    });

    return { message: 'Scheduled event cancelled' };
  }

  // ── DISPATCH CRON ─────────────────────────────────────────────────────────────

  /**
   * Every 30 seconds: find pending scheduled events due for dispatch
   * and convert them to real WebhookEvents in the delivery queue.
   */
  @Cron('*/30 * * * * *')
  async dispatchDueEvents() {
    const now = new Date();
    const dueEvents = await this.scheduledModel.find({
      status: ScheduledEventStatus.PENDING,
      scheduledFor: { $lte: now },
    }).limit(100).exec();

    if (dueEvents.length === 0) return;

    this.logger.log(`📅 Dispatching ${dueEvents.length} scheduled events`);

    for (const scheduled of dueEvents) {
      try {
        // Verify endpoint is still active
        const endpoint = await this.endpointModel.findById(scheduled.endpointId);
        if (!endpoint || endpoint.status !== EndpointStatus.ACTIVE) {
          await this.scheduledModel.findByIdAndUpdate(scheduled.id, {
            status: ScheduledEventStatus.FAILED,
            dispatchedAt: now,
          });
          this.logger.warn(`Scheduled event ${scheduled.id} failed: endpoint inactive`);
          continue;
        }

        // PII scrubbing
        let payloadToStore = scheduled.payload;
        if (endpoint.piiFields?.length) {
          payloadToStore = PiiScrubber.scrub(scheduled.payload, endpoint.piiFields);
        }

        // Encrypt if enabled
        let finalPayload: any = payloadToStore;
        if (PayloadCrypto.isEnabled()) {
          finalPayload = PayloadCrypto.encrypt(JSON.stringify(payloadToStore));
        }

        // Create real WebhookEvent
        const idempotencyKey = scheduled.idempotencyKey ||
          `sched-${scheduled.id}-${Date.now()}`;

        const event = await this.eventModel.create({
          projectId: scheduled.projectId,
          endpointId: scheduled.endpointId,
          eventType: scheduled.eventType,
          payload: finalPayload,
          idempotencyKey,
          priority: scheduled.priority,
          status: 'pending',
        });

        // Queue for delivery
        const priorityMap: Record<string, number> = { p0: 1, p1: 2, p2: 3, p3: 4 };
        await this.webhookQueue.add('deliver', { eventId: event.id }, {
          attempts: 1,
          removeOnComplete: true,
          priority: priorityMap[scheduled.priority] || 3,
        });

        // Update scheduled event
        await this.scheduledModel.findByIdAndUpdate(scheduled.id, {
          status: ScheduledEventStatus.QUEUED,
          dispatchedEventId: event.id,
          dispatchedAt: now,
        });

        this.logger.log(
          `Dispatched scheduled event ${scheduled.id} → event ${event.id}`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to dispatch scheduled event ${scheduled.id}: ${err.message}`,
        );
      }
    }
  }
}
