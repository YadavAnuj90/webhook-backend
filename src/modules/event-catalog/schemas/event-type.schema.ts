import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class EventType extends Document {
  @Prop({ required: true }) projectId: string;
  @Prop({ required: true, trim: true }) name: string; // e.g. "invoice.paid"
  @Prop({ default: 'v1' }) version: string;           // e.g. "v2"
  @Prop({ trim: true }) description: string;
  @Prop({ type: Object, default: null }) jsonSchema: Record<string, any> | null; // renamed from "schema" — avoids conflict with Mongoose Document.schema // JSON Schema
  @Prop({ type: Object, default: null }) samplePayload: Record<string, any> | null;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ type: [String], default: [] }) tags: string[];

  // FEATURE 8: SLA Monitoring
  @Prop({ default: 0 }) maxDeliverySeconds: number; // 0 = no SLA

  // FEATURE 17: Event TTL / Auto-Expiry
  @Prop({ default: 0 }) defaultTtlSeconds: number; // 0 = no TTL
}

export const EventTypeSchema = SchemaFactory.createForClass(EventType);
EventTypeSchema.index({ projectId: 1, name: 1, version: 1 }, { unique: true });
EventTypeSchema.index({ projectId: 1, isActive: 1 });
