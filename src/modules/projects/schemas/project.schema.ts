import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class Project extends Document {
  @Prop({ type: String, required: true, trim: true }) name:        string;
  @Prop({ type: String, trim: true }) description: string;
  @Prop({ required: true })             ownerId:     string;

  @Prop({ type: String, default: null }) workspaceId: string | null;

  @Prop({
    type: [{ userId: String, role: { type: String, enum: ['owner', 'admin', 'developer', 'viewer'] } }],
    default: [],
    _id: false,
  })
  members: { userId: string; role: 'owner' | 'admin' | 'developer' | 'viewer' }[];

  @Prop({ default: true }) isActive: boolean;

  @Prop({ default: 5 })     maxRetryAttempts:    number;
  @Prop({ default: 30000 }) defaultTimeoutMs:    number;

  @Prop({ default: 10000 }) monthlyEventLimit:   number;
  @Prop({ default: 0 })     currentMonthEvents:  number;
  @Prop({ type: Date, default: null }) usageResetAt: Date | null;

  @Prop({ type: Date, default: null }) deletedAt: Date | null;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

ProjectSchema.index(
  { ownerId: 1, isActive: 1, deletedAt: 1 },
  {
    partialFilterExpression: { deletedAt: null },
    name: 'idx_owner_active_partial',
  },
);

ProjectSchema.index(
  { 'members.userId': 1, deletedAt: 1 },
  { name: 'idx_member_lookup' },
);

ProjectSchema.index({ ownerId: 1, deletedAt: 1 }, { name: 'idx_owner_deleted' });

ProjectSchema.index(
  { workspaceId: 1, deletedAt: 1 },
  { sparse: true, name: 'idx_workspace_projects' },
);

ProjectSchema.index(
  { usageResetAt: 1 },
  { sparse: true, name: 'idx_usage_reset' },
);
