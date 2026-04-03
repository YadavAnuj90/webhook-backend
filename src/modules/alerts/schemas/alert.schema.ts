import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * AlertRule — checked on every delivery failure.
 *
 * DBA decisions:
 * - Partial index on isActive:true — disabled rules never touched during delivery
 * - lastTriggeredAt updated atomically via $set
 * - triggerCount incremented atomically via $inc
 */
@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class AlertRule {
  @Prop({ type: Types.ObjectId, ref: 'User',    required: true }) userId:    Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Project' })                  projectId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Endpoint' })                 endpointId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true }) name: string;

  @Prop({
    enum: ['consecutive_failures', 'failure_rate', 'latency_spike', 'all_failures'],
    default: 'consecutive_failures',
  })
  conditionType: string;

  @Prop({ default: 3 })   threshold:       number;
  @Prop({ enum: ['email', 'slack', 'webhook'], default: 'email' }) channel: string;
  @Prop({ type: String, trim: true }) channelTarget:   string;

  @Prop({ default: true })                 isActive:       boolean;
  @Prop({ type: Date, default: null })     lastTriggeredAt: Date | null;  // $set atomically
  @Prop({ default: 0 })                    triggerCount:   number;        // $inc atomically
  @Prop({ default: 300 })                  cooldownSeconds: number;
}

export const AlertRuleSchema = SchemaFactory.createForClass(AlertRule);
export type AlertRuleDocument = AlertRule & Document;

// User's alerts list (settings page)
AlertRuleSchema.index({ userId: 1, isActive: 1 }, { name: 'idx_user_active' });

// Project-level delivery check
AlertRuleSchema.index({ projectId: 1, isActive: 1 }, { name: 'idx_project_active' });

// Endpoint-level delivery check — partial: skip indexing inactive rules entirely
AlertRuleSchema.index(
  { endpointId: 1, conditionType: 1 },
  { partialFilterExpression: { isActive: true }, name: 'idx_endpoint_type_partial' },
);
