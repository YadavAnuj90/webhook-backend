import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  DEVELOPER = 'developer',
  VIEWER = 'viewer',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, lowercase: true }) email: string;
  @Prop({ required: true }) passwordHash: string;
  @Prop({ required: true }) firstName: string;
  @Prop({ required: true }) lastName: string;
  @Prop({ default: null }) avatarUrl: string;
  @Prop({ default: UserRole.DEVELOPER, enum: UserRole }) role: UserRole;
  @Prop({ default: UserStatus.ACTIVE, enum: UserStatus }) status: UserStatus;
  @Prop({ default: null }) phone: string;
  @Prop({ default: null }) company: string;
  @Prop({ default: null }) timezone: string;
  @Prop({ default: 'en' }) language: string;

  // Email verification
  @Prop({ default: false }) emailVerified: boolean;
  @Prop({ default: null }) emailVerifyToken: string;

  // Password reset
  @Prop({ default: null }) passwordResetToken: string;
  @Prop({ default: null }) passwordResetExpiry: Date;

  // 2FA
  @Prop({ default: false }) twoFactorEnabled: boolean;
  @Prop({ default: null }) twoFactorSecret: string;

  // Stripe
  @Prop({ default: null }) razorpayOrderId: string;
  @Prop({ default: null }) razorpayPaymentId: string;
  @Prop({ default: 'free', enum: ['free', 'starter', 'pro', 'enterprise'] }) plan: string;
  @Prop({ default: null }) subscriptionStartAt: Date;
  @Prop({ default: null }) subscriptionEndAt: Date;

  // Sessions (active refresh tokens)
  @Prop({ type: [{ token: String, device: String, ip: String, createdAt: Date, lastUsed: Date }], default: [] })
  sessions: { token: string; device: string; ip: string; createdAt: Date; lastUsed: Date }[];

  // Activity
  @Prop({ default: null }) lastLoginAt: Date;
  @Prop({ default: null }) lastLoginIp: string;
  @Prop({ default: 0 }) loginCount: number;

  // Preferences
  @Prop({ type: Object, default: { theme: 'dark', emailNotifications: true, slackNotifications: false } })
  preferences: Record<string, any>;

  // Search — full name for text index
  @Prop() fullName: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ fullName: 'text', email: 'text', company: 'text' });
