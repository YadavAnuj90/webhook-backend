import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class AlertRule {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Project' }) projectId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Endpoint' }) endpointId: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ enum: ['consecutive_failures','failure_rate','latency_spike','all_failures'], default: 'consecutive_failures' }) conditionType: string;
  @Prop({ default: 3 }) threshold: number; // failures count or % or ms
  @Prop({ enum: ['email','slack','webhook'], default: 'email' }) channel: string;
  @Prop({ trim: true }) channelTarget: string; // email addr, slack webhook url, or webhook url
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: null }) lastTriggeredAt: Date;
  @Prop({ default: 0 }) triggerCount: number;
  @Prop({ default: 300 }) cooldownSeconds: number; // don't re-alert within this window
}
export const AlertRuleSchema = SchemaFactory.createForClass(AlertRule);
export type AlertRuleDocument = AlertRule & Document;
