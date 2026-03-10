import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class ApiKey extends Document {
  @Prop({ required: true, unique: true })
  key: string; // hashed

  @Prop({ required: true })
  prefix: string; // e.g. "whk_abc123" — shown to user

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ default: null })
  projectId: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: null })
  expiresAt: Date;

  @Prop({ default: null })
  lastUsedAt: Date;

  @Prop({ default: 0 })
  usageCount: number;

  @Prop({ type: [String], default: ['read', 'write'] })
  scopes: string[]; // granular permissions: read, write, admin
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
ApiKeySchema.index({ userId: 1, projectId: 1 });
