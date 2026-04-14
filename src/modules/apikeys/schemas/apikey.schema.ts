import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApiKeyDocument = ApiKey & Document;

@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class ApiKey {
  @Prop({ type: Types.ObjectId, ref: 'User',      required: true }) userId:      Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Workspace' })                  workspaceId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true }) name:      string;
  @Prop({ required: true, unique: true }) keyHash:   string;
  @Prop({ required: true })              keyPrefix:  string;

  @Prop({ type: [String], default: ['read', 'write'] }) scopes: string[];

  @Prop({ type: Date, default: null }) expiresAt:  Date | null;
  @Prop({ type: Date, default: null }) lastUsedAt: Date | null;
  @Prop({ default: 0 })               usageCount: number;
  @Prop({ default: true })            isActive:   boolean;
  @Prop({ type: String, trim: true }) description: string;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

ApiKeySchema.index(
  { userId: 1, isActive: 1 },
  { name: 'idx_user_active' },
);

ApiKeySchema.index(
  { workspaceId: 1, isActive: 1 },
  { sparse: true, name: 'idx_workspace_active' },
);

ApiKeySchema.index(
  { expiresAt: 1 },
  { sparse: true, name: 'idx_expiry' },
);

ApiKeySchema.index(
  { keyHash: 1 },
  { partialFilterExpression: { isActive: true }, name: 'idx_keyhash_active_partial' },
);
