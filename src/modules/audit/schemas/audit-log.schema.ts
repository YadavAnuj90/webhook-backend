import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum AuditAction {
  LOGIN                  = 'auth.login',
  LOGOUT                 = 'auth.logout',
  REGISTER               = 'auth.register',
  PASSWORD_RESET         = 'auth.password_reset',
  PASSWORD_CHANGE        = 'auth.password_change',
  API_KEY_CREATED        = 'auth.api_key_created',
  API_KEY_REVOKED        = 'auth.api_key_revoked',
  ENDPOINT_CREATED       = 'endpoint.created',
  ENDPOINT_UPDATED       = 'endpoint.updated',
  ENDPOINT_DELETED       = 'endpoint.deleted',
  ENDPOINT_PAUSED        = 'endpoint.paused',
  ENDPOINT_RESUMED       = 'endpoint.resumed',
  SECRET_ROTATED         = 'endpoint.secret_rotated',
  EVENT_SENT             = 'event.sent',
  EVENT_REPLAYED         = 'event.replayed',
  EVENT_BROADCAST        = 'event.broadcast',
  USER_INVITED           = 'user.invited',
  USER_ROLE_CHANGED      = 'user.role_changed',
  USER_SUSPENDED         = 'user.suspended',
  PROFILE_UPDATED        = 'user.profile_updated',
  SUBSCRIPTION_CREATED   = 'billing.subscription_created',
  SUBSCRIPTION_CANCELLED = 'billing.subscription_cancelled',
  PAYMENT_SUCCESS        = 'billing.payment_success',
  PAYMENT_FAILED         = 'billing.payment_failed',
  BILLING_PAYMENT_ATTEMPT = 'billing.payment_attempt',
  BILLING_PAYMENT_SUCCESS = 'billing.payment_success_v2',
  BILLING_PAYMENT_FAILED  = 'billing.payment_failed_v2',
  // 2FA
  TWO_FACTOR_ENABLED               = 'auth.2fa_enabled',
  TWO_FACTOR_DISABLED              = 'auth.2fa_disabled',
  TWO_FACTOR_RECOVERY_REGENERATED  = 'auth.2fa_recovery_regenerated',
  TWO_FACTOR_LOGIN                 = 'auth.2fa_login',

  // ── Workspace / Team RBAC ──────────────────────────────────────────────
  WORKSPACE_CREATED       = 'workspace.created',
  WORKSPACE_UPDATED       = 'workspace.updated',
  WORKSPACE_DELETED       = 'workspace.deleted',
  MEMBER_INVITED          = 'team.member_invited',
  MEMBER_JOINED           = 'team.member_joined',
  MEMBER_REMOVED          = 'team.member_removed',
  MEMBER_ROLE_CHANGED     = 'team.member_role_changed',
  INVITE_REVOKED          = 'team.invite_revoked',

  // ── Project / Application RBAC ─────────────────────────────────────────
  PROJECT_MEMBER_ADDED    = 'project.member_added',
  PROJECT_MEMBER_REMOVED  = 'project.member_removed',
  PROJECT_ROLE_CHANGED    = 'project.member_role_changed',

  // ── Super Admin God-Mode Actions ───────────────────────────────────────
  SUPER_ADMIN_ACCESS      = 'admin.god_mode_access',
}

/**
 * AuditLog — immutable, append-only, compliance-critical.
 *
 * DBA decisions:
 * - versionKey:false — logs are never updated
 * - Insert-only pattern; never call save() after initial create()
 * - TTL: 1 year retention (SOC2 standard)
 * - Partial index on outcome:'failure' for security monitoring
 */
@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class AuditLog extends Document {
  @Prop({ required: true }) userId:       string;
  @Prop()                   userEmail:    string;
  @Prop({ required: true, enum: AuditAction }) action: AuditAction;
  @Prop({ type: Object, default: {} }) metadata: Record<string, any>;
  @Prop() ipAddress:    string;
  @Prop() userAgent:    string;
  @Prop() resourceId:   string;
  @Prop() resourceType: string;
  @Prop({ default: 'success', enum: ['success', 'failure'] }) outcome: string;
  @Prop() errorMessage: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// User activity feed (most common read)
AuditLogSchema.index({ userId: 1, createdAt: -1 }, { name: 'idx_user_time' });

// Security: failed auth events
AuditLogSchema.index({ action: 1, outcome: 1, createdAt: -1 }, { name: 'idx_action_outcome_time' });

// Resource-level audit trail
AuditLogSchema.index(
  { resourceType: 1, resourceId: 1, createdAt: -1 },
  { sparse: true, name: 'idx_resource_time' },
);

// Admin full log
AuditLogSchema.index({ createdAt: -1 }, { name: 'idx_time_desc' });

// Security: partial index for failures only (smaller, faster for incident queries)
AuditLogSchema.index(
  { userId: 1, createdAt: -1 },
  { partialFilterExpression: { outcome: 'failure' }, name: 'idx_user_failures_partial' },
);

// TTL: 1 year
AuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 365 * 24 * 3600, name: 'ttl_audit_log' },
);
