import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Project — tenant root; checked on every API call for ownership/membership.
 *
 * DBA decisions:
 * - versionKey:false
 * - Soft delete: deletedAt — all queries must add { deletedAt: null }
 * - members array uses multikey index for fast membership checks:
 *     find({ 'members.userId': userId, deletedAt: null })
 * - currentMonthEvents updated atomically via $inc
 * - usageResetAt updated atomically via $set when billing cycle rolls over
 * - Partial index on isActive:true + deletedAt:null for active-project listing
 */
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

  // ── Workspace link — ties this project (Application) to a Workspace (Company) ──
  // When set, workspace members inherit access to this project.
  // Per-project member roles override workspace-level roles.
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

  // Usage counters — updated atomically via $inc / $set
  @Prop({ default: 10000 }) monthlyEventLimit:   number;
  @Prop({ default: 0 })     currentMonthEvents:  number;   // $inc per event
  @Prop({ type: Date, default: null }) usageResetAt: Date | null;  // $set on cycle roll

  // Soft delete
  @Prop({ type: Date, default: null }) deletedAt: Date | null;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

// Owner's active project list (most common query)
ProjectSchema.index(
  { ownerId: 1, isActive: 1, deletedAt: 1 },
  {
    partialFilterExpression: { deletedAt: null },
    name: 'idx_owner_active_partial',
  },
);

// Membership check: "which projects does userId belong to?"
ProjectSchema.index(
  { 'members.userId': 1, deletedAt: 1 },
  { name: 'idx_member_lookup' },
);

// Soft-delete admin view
ProjectSchema.index({ ownerId: 1, deletedAt: 1 }, { name: 'idx_owner_deleted' });

// Workspace link: "which projects belong to this workspace?"
ProjectSchema.index(
  { workspaceId: 1, deletedAt: 1 },
  { sparse: true, name: 'idx_workspace_projects' },
);

// Usage reset job: find projects due for monthly reset
ProjectSchema.index(
  { usageResetAt: 1 },
  { sparse: true, name: 'idx_usage_reset' },
);
