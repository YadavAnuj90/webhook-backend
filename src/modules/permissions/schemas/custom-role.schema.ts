import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * CustomRole — user-defined permission bundles per project or workspace.
 *
 * DBA decisions:
 * - Unique constraint on name within a scope (projectId or workspaceId)
 * - permissions is an array of "resource:action" strings validated against ALL_PERMISSIONS
 * - Soft-delete via isActive flag
 */
@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class CustomRole extends Document {
  @Prop({ required: true }) name: string;
  @Prop({ type: String, default: null }) description: string | null;

  /** Scope: either projectId or workspaceId (one must be set) */
  @Prop({ type: String, default: null }) projectId:   string | null;
  @Prop({ type: String, default: null }) workspaceId: string | null;

  /** Array of "resource:action" permission strings */
  @Prop({ type: [String], required: true }) permissions: string[];

  /** Who created this role */
  @Prop({ required: true }) createdBy: string;

  @Prop({ default: true }) isActive: boolean;

  /** Color for UI display (optional) */
  @Prop({ type: String, default: null }) color: string | null;
}

export const CustomRoleSchema = SchemaFactory.createForClass(CustomRole);

// Unique role name per project
CustomRoleSchema.index(
  { projectId: 1, name: 1 },
  { unique: true, sparse: true, name: 'uq_project_role_name' },
);

// Unique role name per workspace
CustomRoleSchema.index(
  { workspaceId: 1, name: 1 },
  { unique: true, sparse: true, name: 'uq_workspace_role_name' },
);

// List active roles for a scope
CustomRoleSchema.index(
  { projectId: 1, isActive: 1 },
  { name: 'idx_project_active_roles' },
);
