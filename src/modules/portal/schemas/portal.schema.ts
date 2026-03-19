import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class PortalToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) userId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Project', required: true }) projectId: Types.ObjectId;
  @Prop({ required: true, unique: true }) token: string;
  @Prop({ required: true, trim: true }) customerName: string;
  @Prop({ trim: true, lowercase: true }) customerEmail: string;
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: null }) expiresAt: Date;
  @Prop({ default: null }) lastAccessedAt: Date;
  @Prop({ default: 0 }) accessCount: number;

  // ─── Legacy branding (kept for compat) ────────────────────────────────────
  @Prop({ trim: true }) logoUrl: string;
  @Prop({ trim: true }) brandColor: string;

  // ─── Full white-label branding ─────────────────────────────────────────────
  @Prop({ trim: true }) companyName: string;
  @Prop({ trim: true }) faviconUrl: string;
  @Prop({ trim: true }) primaryColor: string;    // e.g. "#6366f1"
  @Prop({ trim: true }) secondaryColor: string;
  @Prop({ trim: true }) fontFamily: string;       // e.g. "Inter, sans-serif"
  @Prop({ default: false }) darkMode: boolean;
  @Prop({ trim: true }) customDomain: string;     // e.g. "webhooks.acme.com"
  @Prop({ trim: true }) supportEmail: string;
  @Prop({ trim: true }) portalTitle: string;      // e.g. "Acme Webhook Portal"
  @Prop({ trim: true, default: null }) customCss: string;  // injected into portal <head>
  @Prop({ type: Object, default: {} }) socialLinks: Record<string, string>; // { twitter, docs, support }

  // FEATURE 11: Customer Self-Service Event Subscriptions
  @Prop({ type: [String], default: [] }) subscribedEventTypes: string[]; // e.g. ['order.created','payment.failed']
}

export const PortalTokenSchema = SchemaFactory.createForClass(PortalToken);
// token unique index already created by @Prop({ unique: true }) — removed duplicate
PortalTokenSchema.index({ userId: 1 });
PortalTokenSchema.index({ customDomain: 1 }, { sparse: true, unique: true });

export type PortalTokenDocument = PortalToken & Document;
