import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserRole, UserStatus } from './schemas/user.schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private auditService: AuditService,
  ) {}

  async findById(id: string) {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() });
  }

  async updateProfile(userId: string, dto: any, ip: string) {
    if (dto.firstName || dto.lastName) {
      const existing = await this.userModel.findById(userId);
      if (existing) {
        dto.fullName = `${dto.firstName || existing.firstName} ${dto.lastName || existing.lastName}`;
      }
    }
    const user = await this.userModel.findByIdAndUpdate(userId, dto, { new: true });
    await this.auditService.log({ userId, action: AuditAction.PROFILE_UPDATED, ipAddress: ip });
    return this.safe(user);
  }

  async updatePreferences(userId: string, prefs: Record<string, any>) {
    const user = await this.userModel.findByIdAndUpdate(userId, { $set: { preferences: prefs } }, { new: true });
    return user?.preferences ?? {};
  }

  async listAll(page = 1, limit = 20, search?: string, role?: UserRole, status?: UserStatus) {
    const filter: any = {};
    if (search) filter.$or = [
      { fullName: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { company: new RegExp(search, 'i') },
    ];
    if (role) filter.role = role;
    if (status) filter.status = status;
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userModel.find(filter, { passwordHash: 0, sessions: 0 }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.userModel.countDocuments(filter),
    ]);
    return { users, total, page, limit };
  }

  async changeRole(targetId: string, role: UserRole, requesterId: string, ip: string) {
    await this.userModel.findByIdAndUpdate(targetId, { role });
    await this.auditService.log({ userId: requesterId, action: AuditAction.USER_ROLE_CHANGED, resourceId: targetId, metadata: { newRole: role }, ipAddress: ip });
    return { message: `Role updated to ${role}` };
  }

  async suspendUser(targetId: string, requesterId: string, ip: string) {
    if (targetId === requesterId) throw new ForbiddenException('Cannot suspend yourself');
    await this.userModel.findByIdAndUpdate(targetId, { status: UserStatus.SUSPENDED, sessions: [] });
    await this.auditService.log({ userId: requesterId, action: AuditAction.USER_SUSPENDED, resourceId: targetId, ipAddress: ip });
    return { message: 'User suspended' };
  }

  async activateUser(targetId: string) {
    await this.userModel.findByIdAndUpdate(targetId, { status: UserStatus.ACTIVE });
    return { message: 'User activated' };
  }

  async getStats() {
    const [total, active, suspended, byRole, byPlan] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ status: UserStatus.ACTIVE }),
      this.userModel.countDocuments({ status: UserStatus.SUSPENDED }),
      this.userModel.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      this.userModel.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
    ]);
    return { total, active, suspended, byRole, byPlan };
  }

  safe(user: any) {
    if (!user) return null;
    const u = user.toObject ? user.toObject() : { ...user };
    delete u.passwordHash; delete u.sessions; delete u.passwordResetToken;
    delete u.emailVerifyToken; delete u.twoFactorSecret;
    return u;
  }
}
