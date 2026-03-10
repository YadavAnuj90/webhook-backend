import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum AuditAction {
  // Auth
  LOGIN = 'auth.login',
  LOGOUT = 'auth.logout',
  REGISTER = 'auth.register',
  PASSWORD_RESET = 'auth.password_reset',
  PASSWORD_CHANGE = 'auth.password_change',
  API_KEY_CREATED = 'auth.api_key_created',
  API_KEY_REVOKED = 'auth.api_key_revoked',

  // Endpoints
  ENDPOINT_CREATED = 'endpoint.created',
  ENDPOINT_UPDATED = 'endpoint.updated',
  ENDPOINT_DELETED = 'endpoint.deleted',
  ENDPOINT_PAUSED = 'endpoint.paused',
  ENDPOINT_RESUMED = 'endpoint.resumed',
  SECRET_ROTATED = 'endpoint.secret_rotated',

  // Events
  EVENT_SENT = 'event.sent',
  EVENT_REPLAYED = 'event.replayed',
  EVENT_BROADCAST = 'event.broadcast',

  // Users
  USER_INVITED = 'user.invited',
  USER_ROLE_CHANGED = 'user.role_changed',
  USER_SUSPENDED = 'user.suspended',
  PROFILE_UPDATED = 'user.profile_updated',

  // Billing
  SUBSCRIPTION_CREATED = 'billing.subscription_created',
  SUBSCRIPTION_CANCELLED = 'billing.subscription_cancelled',
  PAYMENT_SUCCESS = 'billing.payment_success',
  PAYMENT_FAILED = 'billing.payment_failed',
  BILLING_PAYMENT_ATTEMPT = 'billing.payment_attempt',
  BILLING_PAYMENT_SUCCESS = 'billing.payment_success_v2',
  BILLING_PAYMENT_FAILED = 'billing.payment_failed_v2',
}

@Schema({ timestamps: true })
export class AuditLog extends Document {
  @Prop({ required: true }) userId: string;
  @Prop() userEmail: string;
  @Prop({ required: true, enum: AuditAction }) action: AuditAction;
  @Prop({ type: Object, default: {} }) metadata: Record<string, any>;
  @Prop() ipAddress: string;
  @Prop() userAgent: string;
  @Prop() resourceId: string;
  @Prop() resourceType: string;
  @Prop({ default: 'success', enum: ['success', 'failure'] }) outcome: string;
  @Prop() errorMessage: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 }); // 1 year TTL
