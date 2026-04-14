import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class EventType extends Document {
  @Prop({ required: true })              projectId:   string;
  @Prop({ type: String, required: true, trim: true }) name:        string;
  @Prop({ default: 'v1' })              version:     string;
  @Prop({ type: String, trim: true }) description: string;
  @Prop({ type: Object, default: null }) jsonSchema:   Record<string, any> | null;
  @Prop({ type: Object, default: null }) samplePayload: Record<string, any> | null;
  @Prop({ default: true })              isActive:    boolean;
  @Prop({ type: [String], default: [] }) tags:       string[];
  @Prop({ default: 0 })                 maxDeliverySeconds: number;
  @Prop({ default: 0 })                 defaultTtlSeconds:  number;
}

export const EventTypeSchema = SchemaFactory.createForClass(EventType);

EventTypeSchema.index(
  { projectId: 1, name: 1, version: 1 },
  { unique: true, name: 'uq_project_name_version' },
);

EventTypeSchema.index(
  { projectId: 1, isActive: 1 },
  { name: 'idx_project_active' },
);

EventTypeSchema.index({ projectId: 1, tags: 1 }, { name: 'idx_project_tags' });

EventTypeSchema.index(
  { name: 'text', description: 'text', tags: 'text' },
  { name: 'text_event_type_search', weights: { name: 10, tags: 5, description: 2 } },
);
