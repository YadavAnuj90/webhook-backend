import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class ApiKey extends Document {
  @Prop({ required: true, unique: true }) key:       string;
  @Prop({ required: true })              prefix:    string;
  @Prop({ required: true })              name:      string;
  @Prop({ required: true })              userId:    string;
  @Prop({ type: String, default: null })               projectId: string | null;
  @Prop({ default: true })               isActive:  boolean;
  @Prop({ type: Date, default: null })   expiresAt:  Date | null;
  @Prop({ type: Date, default: null })   lastUsedAt: Date | null;
  @Prop({ default: 0 })                  usageCount: number;
  @Prop({ type: [String], default: ['read', 'write'] }) scopes: string[];
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

ApiKeySchema.index({ userId: 1, isActive: 1 }, { name: 'idx_user_active' });

ApiKeySchema.index({ userId: 1, projectId: 1 }, { name: 'idx_user_project' });

ApiKeySchema.index({ expiresAt: 1 }, { sparse: true, name: 'idx_expiry' });

ApiKeySchema.index(
  { key: 1 },
  { partialFilterExpression: { isActive: true }, name: 'idx_key_active_partial' },
);
