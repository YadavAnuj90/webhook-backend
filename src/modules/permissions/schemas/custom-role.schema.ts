import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class CustomRole extends Document {
  @Prop({ required: true }) name: string;
  @Prop({ type: String, default: null }) description: string | null;

  @Prop({ type: String, default: null }) projectId:   string | null;
  @Prop({ type: String, default: null }) workspaceId: string | null;

  @Prop({ type: [String], required: true }) permissions: string[];

  @Prop({ required: true }) createdBy: string;

  @Prop({ default: true }) isActive: boolean;

  @Prop({ type: String, default: null }) color: string | null;
}

export const CustomRoleSchema = SchemaFactory.createForClass(CustomRole);

CustomRoleSchema.index(
  { projectId: 1, name: 1 },
  { unique: true, sparse: true, name: 'uq_project_role_name' },
);

CustomRoleSchema.index(
  { workspaceId: 1, name: 1 },
  { unique: true, sparse: true, name: 'uq_workspace_role_name' },
);

CustomRoleSchema.index(
  { projectId: 1, isActive: 1 },
  { name: 'idx_project_active_roles' },
);
