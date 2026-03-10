import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WorkspaceDocument = Workspace & Document;

export enum MemberRole { OWNER = 'owner', ADMIN = 'admin', DEVELOPER = 'developer', VIEWER = 'viewer' }

@Schema({ _id: false })
export class WorkspaceMember {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) userId: Types.ObjectId;
  @Prop({ enum: MemberRole, default: MemberRole.DEVELOPER }) role: MemberRole;
  @Prop({ default: Date.now }) joinedAt: Date;
}
export const WorkspaceMemberSchema = SchemaFactory.createForClass(WorkspaceMember);

@Schema({ timestamps: true })
export class Workspace {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ trim: true }) slug: string;
  @Prop({ trim: true }) description: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) ownerId: Types.ObjectId;
  @Prop({ type: [WorkspaceMemberSchema], default: [] }) members: WorkspaceMember[];
  @Prop({ default: true }) isActive: boolean;
  @Prop({ default: null }) avatarUrl: string;
  @Prop({ default: null }) plan: string;
}
export const WorkspaceSchema = SchemaFactory.createForClass(Workspace);
WorkspaceSchema.index({ slug: 1 }, { unique: true, sparse: true });

@Schema({ timestamps: true })
export class WorkspaceInvite {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true }) workspaceId: Types.ObjectId;
  @Prop({ required: true, lowercase: true }) email: string;
  @Prop({ enum: MemberRole, default: MemberRole.DEVELOPER }) role: MemberRole;
  @Prop({ required: true, unique: true }) token: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) invitedBy: Types.ObjectId;
  @Prop({ default: false }) accepted: boolean;
  @Prop({ default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }) expiresAt: Date;
}
export const WorkspaceInviteSchema = SchemaFactory.createForClass(WorkspaceInvite);
