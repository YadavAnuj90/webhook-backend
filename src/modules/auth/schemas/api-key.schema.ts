import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * ApiKey (auth module) — verified on every API request.
 *
 * DBA decisions:
 * - key unique index (via @Prop unique) — O(1) HMAC lookup
 * - Partial index: only active, non-expired keys in hot-path index
 * - lastUsedAt + usageCount updated atomically via $set/$inc
 * - expiresAt sparse index for expiry jobs
 */
@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class ApiKey extends Document {
  @Prop({ required: true, unique: true }) key:       string;  // hashed
  @Prop({ required: true })              prefix:    string;
  @Prop({ required: true })              name:      string;
  @Prop({ required: true })              userId:    string;
  @Prop({ type: String, default: null })               projectId: string | null;
  @Prop({ default: true })               isActive:  boolean;
  @Prop({ type: Date, default: null })   expiresAt:  Date | null;
  @Prop({ type: Date, default: null })   lastUsedAt: Date | null;  // $set atomically
  @Prop({ default: 0 })                  usageCount: number;        // $inc atomically
  @Prop({ type: [String], default: ['read', 'write'] }) scopes: string[];
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

// key unique from @Prop(unique:true)

// User's key list (dashboard)
ApiKeySchema.index({ userId: 1, isActive: 1 }, { name: 'idx_user_active' });

// Project-scoped keys
ApiKeySchema.index({ userId: 1, projectId: 1 }, { name: 'idx_user_project' });

// Expiry job
ApiKeySchema.index({ expiresAt: 1 }, { sparse: true, name: 'idx_expiry' });

// Hot-path: only valid active keys (partial — revoked keys not indexed)
ApiKeySchema.index(
  { key: 1 },
  { partialFilterExpression: { isActive: true }, name: 'idx_key_active_partial' },
);
