import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Project extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  ownerId: string;

  @Prop({ type: [{ userId: String, role: String }], default: [] })
  members: { userId: string; role: 'admin' | 'member' | 'viewer' }[];

  @Prop({ default: true })
  isActive: boolean;

  // Delivery settings per project
  @Prop({ default: 5 })
  maxRetryAttempts: number;

  @Prop({ default: 30000 })
  defaultTimeoutMs: number;

  // Usage limits (for future billing/plans)
  @Prop({ default: 10000 })
  monthlyEventLimit: number;

  @Prop({ default: 0 })
  currentMonthEvents: number;

  @Prop({ default: null })
  usageResetAt: Date;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
ProjectSchema.index({ ownerId: 1 });
