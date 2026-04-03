import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WorkspaceDocument = Workspace & Document;

export enum MemberRole {
  OWNER     = 'owner',
  ADMIN     = 'admin',
  DEVELOPER = 'developer',
  VIEWER    = 'viewer',
}

@Schema({ _id: false, versionKey: false })
export class WorkspaceMember {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) userId: Types.ObjectId;
  @Prop({ enum: MemberRole, default: MemberRole.DEVELOPER })   role:   MemberRole;
  @Prop({ default: Date.now })                                  joinedAt: Date;
}
export const WorkspaceMemberSchema = SchemaFactory.createForClass(WorkspaceMember);

/**
 * Workspace — multi-tenant root entity.
 *
 * DBA decisions:
 * - slug unique+sparse: optional but must be unique when set
 * - members array: indexed on members.userId for O(1) membership check
 * - Members added via $push (atomic, no full-document replace)
 * - Members removed via $pull: { $pull: { members: { userId: id } } }
 * - Role changes via $set: { $set: { 'members.$.role': newRole } } with positional $
 */
@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class Workspace {
  @Prop({ type: String, required: true, trim: true }) name:        string;
  @Prop({ type: String, trim: true }) slug:        string;
  @Prop({ type: String, trim: true }) description: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) ownerId: Types.ObjectId;
  @Prop({ type: [WorkspaceMemberSchema], default: [], _id: false }) members: WorkspaceMember[];
  @Prop({ default: true })  isActive:  boolean;
  @Prop({ type: String, default: null })  avatarUrl: string | null;
  @Prop({ type: String, default: null })  plan:      string | null;
}
export const WorkspaceSchema = SchemaFactory.createForClass(Workspace);

// Slug lookup (e.g. /ws/my-team)
WorkspaceSchema.index({ slug: 1 }, { unique: true, sparse: true, name: 'uq_slug' });
// Owner's workspace list
WorkspaceSchema.index({ ownerId: 1, isActive: 1 }, { name: 'idx_owner_active' });
// "Which workspaces does user X belong to?" — multikey on embedded array
WorkspaceSchema.index({ 'members.userId': 1 }, { name: 'idx_member_lookup' });

// ── WorkspaceInvite ────────────────────────────────────────────────────────────
/**
 * DBA decisions:
 * - token unique: one-click accept link requires O(1) lookup
 * - TTL on expiresAt: invites auto-expire — no cron needed
 * - Partial index on accepted:false: only pending invites in active index
 */
@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class WorkspaceInvite {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true }) workspaceId: Types.ObjectId;
  @Prop({ type: String, required: true, lowercase: true, trim: true }) email: string;
  @Prop({ enum: MemberRole, default: MemberRole.DEVELOPER }) role: MemberRole;
  @Prop({ required: true, unique: true }) token: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) invitedBy: Types.ObjectId;
  @Prop({ default: false }) accepted: boolean;
  @Prop({ default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }) expiresAt: Date;
}
export const WorkspaceInviteSchema = SchemaFactory.createForClass(WorkspaceInvite);

// token unique from @Prop(unique:true)

// "Has this email already been invited to this workspace?"
WorkspaceInviteSchema.index(
  { workspaceId: 1, email: 1 },
  {
    partialFilterExpression: { accepted: false },
    name: 'idx_workspace_email_pending_partial',
  },
);

// Accept invite by token — only pending ones
WorkspaceInviteSchema.index(
  { token: 1 },
  { partialFilterExpression: { accepted: false }, name: 'idx_token_pending_partial' },
);

// TTL: auto-expire invites after 7 days
WorkspaceInviteSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'ttl_invite_expiry' },
);
