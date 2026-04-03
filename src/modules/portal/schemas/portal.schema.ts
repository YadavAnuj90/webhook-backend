import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * PortalToken — customer white-label portal access.
 *
 * DBA decisions:
 * - token unique: JWT-style one-click access — O(1) lookup
 * - expiresAt TTL: tokens auto-expire — no cleanup job needed
 * - accessCount + lastAccessedAt updated atomically via $inc/$set
 * - customDomain unique+sparse: optional but globally unique when set
 * - Partial index on isActive:true — revoked tokens not in hot path
 */
@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class PortalToken {
  @Prop({ type: Types.ObjectId, ref: 'User',    required: true }) userId:    Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Project', required: true }) projectId: Types.ObjectId;
  @Prop({ required: true, unique: true })              token:         string;
  @Prop({ type: String, required: true, trim: true })               customerName:  string;
  @Prop({ type: String, trim: true, lowercase: true })              customerEmail: string;
  @Prop({ default: true })                             isActive:      boolean;
  @Prop({ type: Date, default: null })                 expiresAt:     Date | null;
  @Prop({ type: Date, default: null })                 lastAccessedAt: Date | null;  // $set
  @Prop({ default: 0 })                                accessCount:   number;         // $inc

  // Branding
  @Prop({ type: String, trim: true }) logoUrl:       string;
  @Prop({ type: String, trim: true }) brandColor:    string;
  @Prop({ type: String, trim: true }) companyName:   string;
  @Prop({ type: String, trim: true }) faviconUrl:    string;
  @Prop({ type: String, trim: true }) primaryColor:  string;
  @Prop({ type: String, trim: true }) secondaryColor: string;
  @Prop({ type: String, trim: true }) fontFamily:    string;
  @Prop({ default: false }) darkMode:  boolean;
  @Prop({ type: String, trim: true })     customDomain: string;
  @Prop({ type: String, trim: true })     supportEmail: string;
  @Prop({ type: String, trim: true })     portalTitle:  string;
  @Prop({ type: String, trim: true, default: null }) customCss: string | null;
  @Prop({ type: Object, default: {} }) socialLinks: Record<string, string>;

  @Prop({ type: [String], default: [] }) subscribedEventTypes: string[];
}

export const PortalTokenSchema = SchemaFactory.createForClass(PortalToken);

// token unique from @Prop(unique:true)

// List active tokens for a project
PortalTokenSchema.index(
  { projectId: 1, isActive: 1 },
  { name: 'idx_project_active' },
);

// User's token list
PortalTokenSchema.index({ userId: 1, isActive: 1 }, { name: 'idx_user_active' });

// Custom domain routing — globally unique when set
PortalTokenSchema.index(
  { customDomain: 1 },
  { sparse: true, unique: true, name: 'uq_custom_domain' },
);

// TTL: auto-expire tokens
PortalTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, sparse: true, name: 'ttl_token_expiry' },
);

export type PortalTokenDocument = PortalToken & Document;
