import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertRule, AlertRuleDocument } from './schemas/alert.schema';
import axios from 'axios';
import * as nodemailer from 'nodemailer';

@Injectable()
export class AlertsService {
  constructor(@InjectModel(AlertRule.name) private model: Model<AlertRuleDocument>) {}

  async create(userId: string, dto: any) {
    return this.model.create({ ...dto, userId: new Types.ObjectId(userId) });
  }

  async list(userId: string) {
    return this.model.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 });
  }

  async update(userId: string, id: string, dto: any) {
    const rule = await this.model.findById(id);
    if (!rule) throw new NotFoundException('Alert rule not found');
    if (rule.userId.toString() !== userId) throw new ForbiddenException();
    return this.model.findByIdAndUpdate(id, { $set: dto }, { new: true });
  }

  async delete(userId: string, id: string) {
    const rule = await this.model.findById(id);
    if (!rule) throw new NotFoundException();
    if (rule.userId.toString() !== userId) throw new ForbiddenException();
    await this.model.findByIdAndDelete(id);
    return { success: true };
  }

  async toggle(userId: string, id: string) {
    const rule = await this.model.findById(id);
    if (!rule) throw new NotFoundException();
    if (rule.userId.toString() !== userId) throw new ForbiddenException();
    return this.model.findByIdAndUpdate(id, { isActive: !rule.isActive }, { new: true });
  }

  async test(userId: string, id: string) {
    const rule = await this.model.findById(id);
    if (!rule) throw new NotFoundException();
    if (rule.userId.toString() !== userId) throw new ForbiddenException();
    await this.sendAlert(rule, { test: true, message: 'This is a test alert from WebhookOS' });
    return { sent: true };
  }

  async triggerIfNeeded(endpointId: string, failureCount: number, latencyMs?: number) {
    const rules = await this.model.find({ endpointId: new Types.ObjectId(endpointId), isActive: true });
    for (const rule of rules) {
      const cooldownPassed = !rule.lastTriggeredAt || (Date.now() - rule.lastTriggeredAt.getTime()) > rule.cooldownSeconds * 1000;
      if (!cooldownPassed) continue;
      let shouldTrigger = false;
      if (rule.conditionType === 'consecutive_failures' && failureCount >= rule.threshold) shouldTrigger = true;
      if (rule.conditionType === 'all_failures' && failureCount > 0) shouldTrigger = true;
      if (rule.conditionType === 'latency_spike' && latencyMs && latencyMs >= rule.threshold) shouldTrigger = true;
      if (shouldTrigger) {
        await this.sendAlert(rule, { endpointId, failureCount, latencyMs });
        await this.model.findByIdAndUpdate(rule._id, { lastTriggeredAt: new Date(), $inc: { triggerCount: 1 } });
      }
    }
  }

  private async sendAlert(rule: AlertRuleDocument, data: any) {
    const msg = `🚨 WebhookOS Alert: ${rule.name}\n${JSON.stringify(data, null, 2)}`;
    try {
      if (rule.channel === 'slack') {
        await axios.post(rule.channelTarget, { text: msg, username: 'WebhookOS', icon_emoji: ':webhook:' });
      } else if (rule.channel === 'webhook') {
        await axios.post(rule.channelTarget, { alert: rule.name, data, timestamp: new Date().toISOString() });
      } else if (rule.channel === 'email') {
        const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || '587'), auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
        await transporter.sendMail({ from: process.env.FROM_EMAIL || 'alerts@webhookos.io', to: rule.channelTarget, subject: `[WebhookOS Alert] ${rule.name}`, text: msg });
      }
    } catch (e) { /* log but don't throw */ }
  }
}
