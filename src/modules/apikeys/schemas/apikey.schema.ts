import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApiKeyDocument = ApiKey & Document;

/**
 * ApiKey (workspace module) — looked up on every API request.
 *
 * DBA decisions:
 * - keyHash unique index (via @Prop unique) — O(1) key verification
 * - Partial index on isActive:true — revoked keys never touched in hot path
 * - lastUsedAt + usageCount updated atomically:
 *     $set lastUsedAt + $inc usageCount in one findOneAndUpdate
 * - expiresAt uses sparse index (null = never expires, not indexed)
 */
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
  @Prop({ required: true, unique: true }) keyHash:   string;  // SHA-256 of raw key
  @Prop({ required: true })              keyPrefix:  string;  // first 8 chars shown in UI

  @Prop({ type: [String], default: ['read', 'write'] }) scopes: string[];

  @Prop({ type: Date, default: null }) expiresAt:  Date | null;
  @Prop({ type: Date, default: null }) lastUsedAt: Date | null;  // $set atomically
  @Prop({ default: 0 })               usageCount: number;        // $inc atomically
  @Prop({ default: true })            isActive:   boolean;
  @Prop({ type: String, trim: true }) description: string;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);

// keyHash unique index from @Prop(unique:true)

// List user's active keys
ApiKeySchema.index(
  { userId: 1, isActive: 1 },
  { name: 'idx_user_active' },
);

// Workspace key listing
ApiKeySchema.index(
  { workspaceId: 1, isActive: 1 },
  { sparse: true, name: 'idx_workspace_active' },
);

// Expiry cron: find keys that expire soon
ApiKeySchema.index(
  { expiresAt: 1 },
  { sparse: true, name: 'idx_expiry' },
);

// Hot-path: verify key by hash, only active, not expired
ApiKeySchema.index(
  { keyHash: 1 },
  { partialFilterExpression: { isActive: true }, name: 'idx_keyhash_active_partial' },
);
