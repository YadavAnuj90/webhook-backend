import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN       = 'admin',
  DEVELOPER   = 'developer',
  VIEWER      = 'viewer',
}

export enum UserStatus {
  ACTIVE    = 'active',
  INACTIVE  = 'inactive',
  SUSPENDED = 'suspended',
  PENDING   = 'pending',
}

@Schema({
  timestamps: true,
  versionKey: false,
  toJSON:   { virtuals: false, minimize: true },
  toObject: { virtuals: false, minimize: true },
})
export class User extends Document {
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true }) email: string;
  @Prop({ type: String, default: null }) passwordHash:   string | null;
  @Prop({ type: String, required: true, trim: true }) firstName: string;
  @Prop({ type: String, required: true, trim: true }) lastName:  string;

  @Prop({ type: String, default: null }) googleId:   string | null;
  @Prop({ type: String, default: null }) avatarUrl:  string | null;

  @Prop({ default: UserRole.DEVELOPER, enum: UserRole })  role:   UserRole;
  @Prop({ default: UserStatus.ACTIVE,  enum: UserStatus }) status: UserStatus;

  @Prop({ type: String, default: null }) phone:    string | null;
  @Prop({ type: String, default: null }) company:  string | null;
  @Prop({ type: String, default: null }) timezone: string | null;
  @Prop({ default: 'en' }) language: string;

  @Prop({ default: false }) emailVerified:    boolean;
  @Prop({ type: String, default: null })  emailVerifyToken: string | null;

  @Prop({ type: String, default: null }) passwordResetToken:  string | null;
  @Prop({ type: Date, default: null }) passwordResetExpiry: Date | null;

  @Prop({ default: false }) twoFactorEnabled: boolean;
  @Prop({ type: String, default: null })  twoFactorSecret:  string | null;
  @Prop({ type: [String], default: [] })  twoFactorRecoveryCodes: string[];

  @Prop({ type: String, default: null }) razorpayOrderId:   string | null;
  @Prop({ type: String, default: null }) razorpayPaymentId: string | null;
  @Prop({ default: 'free', enum: ['free', 'starter', 'pro', 'enterprise'] }) plan: string;
  @Prop({ type: Date, default: null }) subscriptionStartAt: Date | null;
  @Prop({ type: Date, default: null }) subscriptionEndAt:   Date | null;

  @Prop({
    type: [{ token: String, device: String, ip: String, createdAt: Date, lastUsed: Date }],
    default: [],
    _id: false,
  })
  sessions: { token: string; device: string; ip: string; createdAt: Date; lastUsed: Date }[];

  @Prop({ type: Date, default: null }) lastLoginAt: Date | null;
  @Prop({ type: String, default: null })             lastLoginIp: string | null;
  @Prop({ default: 0 })                loginCount:  number;

  @Prop({
    type: Object,
    default: { theme: 'dark', emailNotifications: true, slackNotifications: false },
  })
  preferences: Record<string, any>;

  @Prop({ type: String, trim: true }) fullName: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ googleId: 1 }, { sparse: true, unique: true, name: 'uq_google_id' });

UserSchema.index({ emailVerifyToken: 1 },   { sparse: true, name: 'idx_email_verify_token' });
UserSchema.index({ passwordResetToken: 1 },  { sparse: true, name: 'idx_password_reset_token' });

UserSchema.index({ subscriptionEndAt: 1 }, { sparse: true, name: 'idx_subscription_expiry' });

UserSchema.index({ role: 1, status: 1 }, { name: 'idx_role_status' });
UserSchema.index({ plan: 1, status: 1 }, { name: 'idx_plan_status' });

UserSchema.index(
  { fullName: 'text', email: 'text', company: 'text' },
  { name: 'text_user_search', weights: { email: 10, fullName: 5, company: 2 } },
);
