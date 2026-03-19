import {
  Injectable, UnauthorizedException, NotFoundException,
  ConflictException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { User, UserStatus } from '../users/schemas/user.schema';
// Use the canonical ApiKey from apikeys module (keyHash field, keyPrefix)
import { ApiKey, ApiKeyDocument } from '../apikeys/schemas/apikey.schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';
import { TrialService } from '../billing/trial.service';
import { BillingEmailService } from '../billing/billing-email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(ApiKey.name) private apiKeyModel: Model<ApiKeyDocument>,
    private jwtService: JwtService,
    private config: ConfigService,
    private auditService: AuditService,
    private trialService: TrialService,
    private emailService: BillingEmailService,
  ) {}

  async register(dto: { email: string; password: string; firstName: string; lastName: string }, ip: string) {
    const exists = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (exists) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const verifyToken = randomBytes(32).toString('hex');
    const user = await this.userModel.create({
      email: dto.email.toLowerCase(), passwordHash,
      firstName: dto.firstName, lastName: dto.lastName,
      fullName: `${dto.firstName} ${dto.lastName}`,
      emailVerified: false,
      emailVerifyToken: this.hashToken(verifyToken),
    });
    await this.auditService.log({ userId: user.id, userEmail: user.email, action: AuditAction.REGISTER, ipAddress: ip });
    // ── Start 10-day free trial on every new registration ──
    await this.trialService.startTrial(user.id);
    // ── Send verification email (non-blocking) ──────────────
    this.emailService.sendVerificationEmail(user.email, user.firstName, verifyToken).catch(() => {});
    const tokens = await this.issueTokens(user, ip, 'Web');
    return { user: this.safeUser(user), ...tokens };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const hashed = this.hashToken(token);
    const user = await this.userModel.findOne({ emailVerifyToken: hashed });
    if (!user) throw new BadRequestException('Invalid or expired verification token');
    await this.userModel.findByIdAndUpdate(user.id, { emailVerified: true, emailVerifyToken: null });
    return { message: 'Email verified successfully' };
  }

  async resendVerification(userId: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerified) return { message: 'Email is already verified' };
    const verifyToken = randomBytes(32).toString('hex');
    await this.userModel.findByIdAndUpdate(userId, { emailVerifyToken: this.hashToken(verifyToken) });
    await this.emailService.sendVerificationEmail(user.email, user.firstName, verifyToken);
    return { message: 'Verification email sent' };
  }

  async login(email: string, password: string, ip: string, device = 'Web') {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === UserStatus.SUSPENDED) throw new UnauthorizedException('Account suspended');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.auditService.log({ userId: user.id, userEmail: user.email, action: AuditAction.LOGIN, ipAddress: ip, outcome: 'failure' });
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.userModel.findByIdAndUpdate(user.id, { lastLoginAt: new Date(), lastLoginIp: ip, $inc: { loginCount: 1 } });
    const tokens = await this.issueTokens(user, ip, device);
    await this.auditService.log({ userId: user.id, userEmail: user.email, action: AuditAction.LOGIN, ipAddress: ip });
    return { user: this.safeUser(user), ...tokens };
  }

  async logout(userId: string, refreshToken: string, ip: string) {
    const hashed = this.hashToken(refreshToken);
    await this.userModel.findByIdAndUpdate(userId, { $pull: { sessions: { token: hashed } } });
    await this.auditService.log({ userId, action: AuditAction.LOGOUT, ipAddress: ip });
    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string, ip: string) {
    await this.userModel.findByIdAndUpdate(userId, { sessions: [] });
    await this.auditService.log({ userId, action: AuditAction.LOGOUT, ipAddress: ip, metadata: { all: true } });
    return { message: 'Logged out from all devices' };
  }

  async refresh(refreshToken: string, ip: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, { secret: this.config.get('JWT_REFRESH_SECRET') });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const hashed = this.hashToken(refreshToken);
    const user = await this.userModel.findOne({ _id: payload.sub, 'sessions.token': hashed });
    if (!user) throw new UnauthorizedException('Session expired');
    const session = user.sessions.find((s: any) => s.token === hashed);
    await this.userModel.findByIdAndUpdate(user.id, { $pull: { sessions: { token: hashed } } });
    return this.issueTokens(user, ip, session?.device || 'Unknown');
  }

  async getSessions(userId: string) {
    const user = await this.userModel.findById(userId, { sessions: 1 });
    return user?.sessions?.map((s: any) => ({ device: s.device, ip: s.ip, createdAt: s.createdAt, lastUsed: s.lastUsed })) || [];
  }

  async getMe(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.safeUser(user);
  }

  async requestPasswordReset(email: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) return { message: 'If that email exists, a reset link was sent' };
    const token = randomBytes(32).toString('hex');
    await this.userModel.findByIdAndUpdate(user.id, {
      passwordResetToken: this.hashToken(token),
      passwordResetExpiry: new Date(Date.now() + 3600_000),
    });
    this.emailService.sendPasswordReset(user.email, user.firstName, token).catch(() => {});
    return { message: 'If that email exists, a reset link was sent' };
  }

  async resetPassword(token: string, newPassword: string, ip: string) {
    const user = await this.userModel.findOne({
      passwordResetToken: this.hashToken(token),
      passwordResetExpiry: { $gt: new Date() },
    });
    if (!user) throw new BadRequestException('Invalid or expired reset token');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userModel.findByIdAndUpdate(user.id, { passwordHash, passwordResetToken: null, passwordResetExpiry: null, sessions: [] });
    await this.auditService.log({ userId: user.id, action: AuditAction.PASSWORD_RESET, ipAddress: ip });
    return { message: 'Password reset successfully' };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string, ip: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password incorrect');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userModel.findByIdAndUpdate(userId, { passwordHash, sessions: [] });
    await this.auditService.log({ userId, action: AuditAction.PASSWORD_CHANGE, ipAddress: ip });
    return { message: 'Password changed. Please login again.' };
  }

  // API Key management — delegates to the canonical apikeys schema (keyHash field)
  async createApiKey(userId: string, name: string, scopes: string[], expiresAt?: string, ip?: string) {
    const raw = `whk_${randomBytes(32).toString('hex')}`;
    const key = await this.apiKeyModel.create({
      keyHash: this.hashToken(raw),
      keyPrefix: raw.slice(0, 12),
      name,
      userId,
      scopes: scopes?.length ? scopes : ['read', 'write'],
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
    await this.auditService.log({ userId, action: AuditAction.API_KEY_CREATED, metadata: { name }, ipAddress: ip });
    return { id: key.id, name, prefix: key.keyPrefix, rawKey: raw, scopes: key.scopes, expiresAt: key.expiresAt };
  }

  async listApiKeys(userId: string) {
    return this.apiKeyModel.find({ userId, isActive: true }, { keyHash: 0 }).lean();
  }

  async revokeApiKey(keyId: string, userId: string, ip: string) {
    await this.apiKeyModel.findOneAndUpdate({ _id: keyId, userId }, { isActive: false });
    await this.auditService.log({ userId, action: AuditAction.API_KEY_REVOKED, resourceId: keyId, ipAddress: ip });
    return { message: 'API key revoked' };
  }

  async validateApiKey(raw: string) {
    const key = await this.apiKeyModel.findOne({ keyHash: this.hashToken(raw), isActive: true });
    if (!key) return null;
    if (key.expiresAt && key.expiresAt < new Date()) return null;
    await this.apiKeyModel.findByIdAndUpdate(key.id, { lastUsedAt: new Date(), $inc: { usageCount: 1 } });
    const user = await this.userModel.findById(key.userId);
    return { user, scopes: key.scopes };
  }

  private async issueTokens(user: any, ip: string, device: string) {
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      { secret: this.config.get('JWT_SECRET'), expiresIn: this.config.get('JWT_EXPIRES_IN', '15m') },
    );
    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { secret: this.config.get('JWT_REFRESH_SECRET'), expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d') },
    );
    await this.userModel.findByIdAndUpdate(user.id, {
      $push: { sessions: { token: this.hashToken(refreshToken), device, ip, createdAt: new Date(), lastUsed: new Date() } },
    });
    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  safeUser(user: any) {
    if (!user) return null;
    const u = user.toObject ? user.toObject() : { ...user };
    delete u.passwordHash; delete u.sessions; delete u.passwordResetToken;
    delete u.emailVerifyToken; delete u.twoFactorSecret;
    return u;
  }
}
