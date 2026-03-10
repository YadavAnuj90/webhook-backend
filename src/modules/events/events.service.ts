import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Model } from 'mongoose';
import { Queue } from 'bull';
import { WebhookEvent, EventStatus } from './schemas/event.schema';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(WebhookEvent.name) private eventModel: Model<WebhookEvent>,
    @InjectQueue(WEBHOOK_QUEUE) private webhookQueue: Queue,
  ) {}

  async send(projectId: string, endpointId: string, dto: { eventType: string; payload: any; idempotencyKey?: string }) {
    const idempotencyKey = dto.idempotencyKey || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const existing = await this.eventModel.findOne({ idempotencyKey, endpointId });
    if (existing) return { id: existing.id, status: existing.status, duplicate: true };
    const event = await this.eventModel.create({ projectId, endpointId, eventType: dto.eventType, payload: dto.payload, idempotencyKey });
    await this.webhookQueue.add('deliver', { eventId: event.id }, { attempts: 1, removeOnComplete: true });
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
    return event;
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
    const dead = await this.eventModel.find({ projectId, status: EventStatus.DEAD });
    await Promise.all(dead.map(async e => {
      await this.eventModel.findByIdAndUpdate(e.id, { status: EventStatus.PENDING, retryCount: 0, deadAt: null });
      await this.webhookQueue.add('deliver', { eventId: e.id }, { attempts: 1, removeOnComplete: true });
    }));
    return { message: `${dead.length} events queued for replay` };
  }
}
