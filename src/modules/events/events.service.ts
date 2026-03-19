import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Model } from 'mongoose';
import { Queue } from 'bull';
import { WebhookEvent, EventStatus } from './schemas/event.schema';
import { DeliveryLog } from '../delivery/schemas/delivery-log.schema';
import { Endpoint } from '../endpoints/schemas/endpoint.schema';
import { EventType } from '../event-catalog/schemas/event-type.schema';
import { Subscription } from '../billing/schemas/subscription.schema';
import { DeduplicationService } from '../deduplication/deduplication.service';
import { PiiScrubber } from '../../utils/pii-scrubber';
import { PayloadCrypto } from '../../utils/payload-crypto';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(WebhookEvent.name) private eventModel: Model<WebhookEvent>,
    @InjectModel(DeliveryLog.name)  private deliveryLogModel: Model<DeliveryLog>,
    @InjectModel(Endpoint.name)     private endpointModel: Model<Endpoint>,
    @InjectModel(EventType.name)    private eventTypeModel: Model<EventType>,
    @InjectModel(Subscription.name) private subModel: Model<Subscription>,
    @InjectQueue(WEBHOOK_QUEUE)     private webhookQueue: Queue,
    private dedup: DeduplicationService,
  ) {}

  async send(
    projectId: string,
    endpointId: string,
    dto: {
      eventType: string;
      payload: any;
      idempotencyKey?: string;
      deduplicationWindowSecs?: number;
      priority?: string;
    },
    endpointDeduplicationWindowSecs = 0,
    userId?: string,
  ) {
    // ── Monthly event quota check ────────────────────────────────────────────
    if (userId) {
      const sub = await this.subModel.findOne({ userId });
      if (sub && sub.eventsPerMonth > 0) {
        // Count events in current calendar month
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const monthCount = await this.eventModel.countDocuments({ projectId, createdAt: { $gte: monthStart } });
        if (monthCount >= sub.eventsPerMonth) {
          throw new ForbiddenException(
            `Monthly event limit reached (${sub.eventsPerMonth.toLocaleString()} on ${sub.planName} plan). Upgrade or purchase credits to continue.`,
          );
        }
      }
    }

    const idempotencyKey =
      dto.idempotencyKey ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // 1. Permanent idempotency key check
    const existing = await this.eventModel.findOne({
      idempotencyKey,
      endpointId,
    });
    if (existing) return { id: existing.id, status: existing.status, duplicate: true };

    // 2. Time-window deduplication (uses payload hash if no explicit key)
    const windowSecs =
      dto.deduplicationWindowSecs ?? endpointDeduplicationWindowSecs ?? 0;
    if (windowSecs > 0) {
      const dedupKey =
        dto.idempotencyKey || this.dedup.hashPayload(dto.payload);
      const isDup = await this.dedup.isDuplicate(
        projectId,
        endpointId,
        dedupKey,
        windowSecs,
      );
      if (isDup)
        return {
          id: null,
          status: 'deduplicated',
          duplicate: true,
          windowSecs,
        };
    }

    // 3. Load endpoint and event type for metadata
    const endpoint = await this.endpointModel.findById(endpointId);
    const eventType = await this.eventTypeModel.findOne({
      projectId,
      name: dto.eventType,
    });

    // 4. FEATURE 4: Scrub PII before storage
    let payloadToStore = dto.payload;
    if (endpoint?.piiFields && endpoint.piiFields.length > 0) {
      payloadToStore = PiiScrubber.scrub(dto.payload, endpoint.piiFields);
    }

    // 5. FEATURE 5: Encrypt payload if enabled
    let encryptedPayload: any = payloadToStore;
    if (PayloadCrypto.isEnabled()) {
      encryptedPayload = PayloadCrypto.encrypt(JSON.stringify(payloadToStore));
    }

    // 6. FEATURE 17: Set TTL if event type has default
    const expiresAt = eventType?.defaultTtlSeconds
      ? new Date(Date.now() + eventType.defaultTtlSeconds * 1000)
      : null;

    const event = await this.eventModel.create({
      projectId,
      endpointId,
      eventType: dto.eventType,
      payload: encryptedPayload,
      idempotencyKey,
      priority: dto.priority || 'p2',
      expiresAt,
    });

    // 7. FEATURE 1: Map priority to Bull queue priority
    const priorityMap = { p0: 1, p1: 2, p2: 3, p3: 4 };
    const bullPriority = priorityMap[dto.priority || 'p2'] || 3;

    await this.webhookQueue.add('deliver', { eventId: event.id }, {
      attempts: 1,
      removeOnComplete: true,
      priority: bullPriority,
    });

    return { id: event.id, status: event.status };
  }

  async findAll(projectId: string, page = 1, limit = 20, status?: EventStatus, endpointId?: string) {
    const filter: any = { projectId };
    if (status) filter.status = status;
    if (endpointId) filter.endpointId = endpointId;
    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
      this.eventModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.eventModel.countDocuments(filter),
    ]);
    return { events, total, page, limit };
  }

  async findOne(id: string, projectId: string) {
    const event = await this.eventModel.findOne({ _id: id, projectId });
    if (!event) throw new NotFoundException('Event not found');
    const logs = await this.deliveryLogModel
      .find({ eventId: id })
      .sort({ attemptedAt: 1 })
      .lean();
    const deliveryAttempts = logs.map((log) => ({
      statusCode: log.statusCode ?? null,
      durationMs: log.latencyMs ?? null,
      createdAt: log.attemptedAt,
      error: log.errorMessage ?? null,
    }));
    const lastLog = logs[logs.length - 1];
    const lastResponse = lastLog
      ? {
          statusCode: lastLog.statusCode ?? null,
          body: lastLog.responseBody ?? null,
          headers: (lastLog as any).responseHeaders ?? null,
          durationMs: lastLog.latencyMs ?? null,
        }
      : event.lastResponse ?? null;
    const obj = event.toObject() as any;

    // FEATURE 5: Decrypt payload if encrypted
    if (
      typeof obj.payload === 'string' &&
      obj.payload.startsWith('enc:')
    ) {
      obj.payload = JSON.parse(PayloadCrypto.decrypt(obj.payload));
    }

    obj.deliveryAttempts = deliveryAttempts;
    obj.lastResponse = lastResponse;
    return obj;
  }

  async replay(id: string, projectId: string) {
    const event = await this.eventModel.findOne({ _id: id, projectId });
    if (!event) throw new NotFoundException('Event not found');
    await this.eventModel.findByIdAndUpdate(id, { status: EventStatus.PENDING, retryCount: 0, nextRetryAt: null });
    await this.webhookQueue.add('deliver', { eventId: id }, { attempts: 1, removeOnComplete: true });
    return { message: 'Event queued for replay' };
  }

  async getDlq(projectId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const filter = { projectId, status: EventStatus.DEAD };
    const [events, total] = await Promise.all([
      this.eventModel.find(filter).sort({ deadAt: -1 }).skip(skip).limit(limit),
      this.eventModel.countDocuments(filter),
    ]);
    return { events, total, page, limit };
  }

  async replayDlq(projectId: string) {
    const dead = await this.eventModel.find({
      projectId,
      status: EventStatus.DEAD,
    });
    await Promise.all(
      dead.map(async (e) => {
        await this.eventModel.findByIdAndUpdate(e.id, {
          status: EventStatus.PENDING,
          retryCount: 0,
          deadAt: null,
        });
        await this.webhookQueue.add(
          'deliver',
          { eventId: e.id },
          { attempts: 1, removeOnComplete: true },
        );
      }),
    );
    return { message: `${dead.length} events queued for replay` };
  }

  // FEATURE 6: GDPR Right-to-Erasure
  async eraseByCustomerId(
    projectId: string,
    customerId: string,
  ): Promise<{ deletedEvents: number; deletedLogs: number }> {
    const events = await this.eventModel.find({
      projectId,
      $or: [
        { 'payload.customerId': customerId },
        { 'payload.userId': customerId },
        { 'payload.customer_id': customerId },
        { 'payload.user_id': customerId },
      ],
    });

    const eventIds = events.map((e) => e._id);
    const [deletedLogs, deletedEvents] = await Promise.all([
      this.deliveryLogModel.deleteMany({ eventId: { $in: eventIds } }),
      this.eventModel.deleteMany({ _id: { $in: eventIds } }),
    ]);

    return {
      deletedEvents: deletedEvents.deletedCount,
      deletedLogs: deletedLogs.deletedCount,
    };
  }
}
