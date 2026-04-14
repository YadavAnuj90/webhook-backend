import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes, createHmac } from 'crypto';
import axios from 'axios';
import { OperationalWebhook, OperationalEvent } from './schemas/operational-webhook.schema';

@Injectable()
export class OperationalWebhooksService {
  private readonly logger = new Logger(OperationalWebhooksService.name);

  constructor(
    @InjectModel(OperationalWebhook.name)
    private model: Model<OperationalWebhook>,
  ) {}

  async create(projectId: string, dto: { url: string; events?: string[]; description?: string }) {
    const secret = `opwhk_${randomBytes(24).toString('hex')}`;
    return this.model.create({ ...dto, projectId, secret });
  }

  async list(projectId: string) {
    return this.model.find({ projectId }).sort({ createdAt: -1 }).select('-secret');
  }

  async update(projectId: string, id: string, dto: Partial<{ url: string; events: string[]; isActive: boolean; description: string }>) {
    const wh = await this.model.findOneAndUpdate({ _id: id, projectId }, { $set: dto }, { new: true });
    if (!wh) throw new NotFoundException('Operational webhook not found');
    return wh;
  }

  async delete(projectId: string, id: string) {
    const wh = await this.model.findOneAndDelete({ _id: id, projectId });
    if (!wh) throw new NotFoundException('Operational webhook not found');
    return { success: true };
  }

  async rotateSecret(projectId: string, id: string) {
    const secret = `opwhk_${randomBytes(24).toString('hex')}`;
    const wh = await this.model.findOneAndUpdate({ _id: id, projectId }, { secret }, { new: true });
    if (!wh) throw new NotFoundException('Operational webhook not found');
    return { secret };
  }

  async fire(projectId: string, eventType: OperationalEvent, data: Record<string, any>): Promise<void> {
    const hooks = await this.model.find({ projectId, isActive: true, events: eventType });
    if (!hooks.length) return;

    const payload = JSON.stringify({
      event: eventType,
      projectId,
      data,
      ts: new Date().toISOString(),
    });

    await Promise.allSettled(hooks.map(async (hook) => {
      const sig = createHmac('sha256', hook.secret).update(payload).digest('hex');
      try {
        await axios.post(hook.url, JSON.parse(payload), {
          timeout: 10_000,
          headers: {
            'Content-Type': 'application/json',
            'X-Operational-Signature': `sha256=${sig}`,
            'X-Operational-Event': eventType,
          },
        });
        await this.model.findByIdAndUpdate(hook._id, {
          lastFiredAt: new Date(), $inc: { totalFired: 1 },
        });
        this.logger.log(`🔔 Operational webhook fired: ${eventType} → ${hook.url}`);
      } catch (e: any) {
        this.logger.warn(`⚠️  Operational webhook failed: ${hook.url} — ${e.message}`);
      }
    }));
  }

  async test(projectId: string, id: string) {
    const hook = await this.model.findOne({ _id: id, projectId });
    if (!hook) throw new NotFoundException();
    const payload = JSON.stringify({ event: 'test', projectId, data: { message: 'Test event from WebhookOS' }, ts: new Date().toISOString() });
    const sig = createHmac('sha256', hook.secret).update(payload).digest('hex');
    try {
      const res = await axios.post(hook.url, JSON.parse(payload), {
        timeout: 10_000,
        headers: { 'Content-Type': 'application/json', 'X-Operational-Signature': `sha256=${sig}` },
      });
      return { success: true, status: res.status };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
}
