import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApiKeyDocument = ApiKey & Document;

@Schema({ timestamps: true })
export class ApiKey {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Workspace' }) workspaceId: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true, unique: true }) keyHash: string;
  @Prop({ required: true }) keyPrefix: string; // first 8 chars shown to user
  @Prop({ type: [String], default: ['read', 'write'] }) scopes: string[];
  @Prop({ default: null }) expiresAt: Date;
  @Prop({ default: null }) lastUsedAt: Date;
  @Prop({ default: 0 }) usageCount: number;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ trim: true }) description: string;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
ApiKeySchema.index({ userId: 1, isActive: 1 });
// keyHash unique index already created by @Prop({ unique: true }) — removed duplicate
