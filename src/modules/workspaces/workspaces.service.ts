import {
  Injectable, NotFoundException, ForbiddenException,
  ConflictException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Workspace, WorkspaceDocument, WorkspaceInvite, MemberRole,
} from './schemas/workspace.schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    @InjectModel(Workspace.name) private wsModel: Model<WorkspaceDocument>,
    @InjectModel(WorkspaceInvite.name) private inviteModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
    @InjectModel('Subscription') private subscriptionModel: Model<any>,
    private auditService: AuditService,
  ) {}

  async create(userId: string, dto: any) {
    const slug =
      (dto.name as string)
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '') +
      '-' +
      Date.now().toString(36);

    const ws = await this.wsModel.create({
      name: dto.name,
      slug,
      description: dto.description,
      ownerId: new Types.ObjectId(userId),
      members: [
        {
          userId: new Types.ObjectId(userId),
          role: MemberRole.OWNER,
          joinedAt: new Date(),
        },
      ],
    });

    await this.auditService.log({
      userId,
      action: AuditAction.WORKSPACE_CREATED,
      resourceId: ws._id.toString(),
      resourceType: 'workspace',
      metadata: { name: dto.name, slug },
    });

    return ws;
  }

  async findAllForUser(userId: string, userRole?: string) {

    if (userRole === 'super_admin') {
      return this.wsModel.find({ isActive: true }).sort({ createdAt: -1 });
    }
    return this.wsModel
      .find({ 'members.userId': new Types.ObjectId(userId), isActive: true })
      .sort({ createdAt: -1 });
  }

  async findOne(id: string, userId: string, userRole?: string) {
    const ws = await this.wsModel.findById(id);
    if (!ws) throw new NotFoundException('Workspace not found');

    if (userRole === 'super_admin') return ws;

    const isMember = ws.members.some(
      (m) => m.userId.toString() === userId,
    );
    if (!isMember) throw new ForbiddenException('Not a member');
    return ws;
  }

  async update(id: string, userId: string, dto: any, userRole?: string) {
    const ws = await this.findOne(id, userId, userRole);

    if (userRole !== 'super_admin') {
      const member = ws.members.find(
        (m) => m.userId.toString() === userId,
      );
      if (!member || !['owner', 'admin'].includes(member.role)) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    return this.wsModel.findByIdAndUpdate(id, { $set: dto }, { new: true });
  }

  async invite(
    id: string,
    userId: string,
    dto: { email: string; role: MemberRole },
    userRole?: string,
  ) {
    const ws = await this.findOne(id, userId, userRole);

    if (userRole !== 'super_admin') {
      const member = ws.members.find(
        (m) => m.userId.toString() === userId,
      );
      if (!member || !['owner', 'admin'].includes(member.role)) {
        throw new ForbiddenException('Only workspace owner or admin can invite members');
      }
    }

    if (userRole !== 'super_admin') {
      await this.enforceEnterprisePlan(ws.ownerId.toString());
    }

    const subscription: any = await this.subscriptionModel
      .findOne({ userId: ws.ownerId.toString() })
      .lean();
    const teamLimit = subscription?.teamMembersLimit || 1;
    const currentMemberCount = ws.members.length;
    const pendingInvites = await this.inviteModel.countDocuments({
      workspaceId: ws._id,
      accepted: false,
    });

    if (currentMemberCount + pendingInvites >= teamLimit && userRole !== 'super_admin') {
      throw new ForbiddenException(
        `Team member limit reached (${teamLimit}). Upgrade your plan for more members.`,
      );
    }

    const existingMember: any = await this.userModel.findOne({ email: dto.email.toLowerCase() }).lean();
    if (existingMember) {
      const already = ws.members.some(
        (m) => m.userId.toString() === existingMember._id.toString(),
      );
      if (already) throw new ConflictException('User is already a member');
    }

    const existingInvite = await this.inviteModel.findOne({
      workspaceId: ws._id,
      email: dto.email.toLowerCase(),
      accepted: false,
    });
    if (existingInvite) throw new ConflictException('Invite already sent to this email');

    const token = uuidv4();
    const otp = this.generateOtp();

    const invite = await this.inviteModel.create({
      workspaceId: ws._id,
      email: dto.email.toLowerCase(),
      role: dto.role,
      token,
      otp,
      invitedBy: new Types.ObjectId(userId),
    });

    await this.auditService.log({
      userId,
      action: AuditAction.MEMBER_INVITED,
      resourceId: ws._id.toString(),
      resourceType: 'workspace',
      metadata: {
        email: dto.email,
        role: dto.role,
        inviteMethod: 'email+otp',
        isSuperAdmin: userRole === 'super_admin',
      },
    });

    this.logger.log(`Invite sent: ${dto.email} → workspace ${ws.name} as ${dto.role}`);

    return {
      invite: {
        id: invite._id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
      inviteUrl: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/invite/${token}`,
      otp,
    };
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.inviteModel.findOne({ token, accepted: false });
    if (!invite) throw new NotFoundException('Invalid or expired invite');
    if (new Date() > invite.expiresAt) throw new ForbiddenException('Invite expired');

    return this.processAcceptInvite(invite, userId);
  }

  async acceptInviteByOtp(workspaceId: string, otp: string, userId: string) {
    const invite = await this.inviteModel.findOne({
      workspaceId: new Types.ObjectId(workspaceId),
      otp,
      accepted: false,
    });
    if (!invite) throw new NotFoundException('Invalid OTP or no pending invite');
    if (new Date() > invite.expiresAt) throw new ForbiddenException('Invite expired');

    const user: any = await this.userModel.findById(userId).select('email').lean();
    if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ForbiddenException('OTP does not match your email');
    }

    return this.processAcceptInvite(invite, userId);
  }

  async removeMember(
    id: string,
    userId: string,
    targetUserId: string,
    userRole?: string,
  ) {
    const ws = await this.findOne(id, userId, userRole);

    if (userRole !== 'super_admin') {
      const requester = ws.members.find(
        (m) => m.userId.toString() === userId,
      );
      if (!requester || !['owner', 'admin'].includes(requester.role)) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    if (targetUserId === ws.ownerId.toString()) {
      throw new ForbiddenException('Cannot remove workspace owner');
    }

    await this.wsModel.findByIdAndUpdate(id, {
      $pull: { members: { userId: new Types.ObjectId(targetUserId) } },
    });

    await this.auditService.log({
      userId,
      action: AuditAction.MEMBER_REMOVED,
      resourceId: ws._id.toString(),
      resourceType: 'workspace',
      metadata: {
        targetUserId,
        isSuperAdmin: userRole === 'super_admin',
      },
    });

    return { success: true };
  }

  async updateMemberRole(
    id: string,
    userId: string,
    targetUserId: string,
    role: MemberRole,
    userRole?: string,
  ) {
    const ws = await this.findOne(id, userId, userRole);

    if (userRole !== 'super_admin') {
      const requester = ws.members.find(
        (m) => m.userId.toString() === userId,
      );
      if (!requester || requester.role !== MemberRole.OWNER) {
        throw new ForbiddenException('Only owner can change roles');
      }
    }

    if (targetUserId === ws.ownerId.toString() && role !== MemberRole.OWNER) {
      throw new ForbiddenException('Cannot change workspace owner\'s role');
    }

    await this.wsModel.updateOne(
      { _id: id, 'members.userId': new Types.ObjectId(targetUserId) },
      { $set: { 'members.$.role': role } },
    );

    await this.auditService.log({
      userId,
      action: AuditAction.MEMBER_ROLE_CHANGED,
      resourceId: ws._id.toString(),
      resourceType: 'workspace',
      metadata: {
        targetUserId,
        newRole: role,
        isSuperAdmin: userRole === 'super_admin',
      },
    });

    return { success: true };
  }

  async listInvites(id: string, userId: string, userRole?: string) {
    await this.findOne(id, userId, userRole);
    return this.inviteModel
      .find({ workspaceId: id, accepted: false })
      .select('-token -otp')
      .sort({ createdAt: -1 });
  }

  async revokeInvite(
    workspaceId: string,
    inviteId: string,
    userId: string,
    userRole?: string,
  ) {
    const ws = await this.findOne(workspaceId, userId, userRole);

    if (userRole !== 'super_admin') {
      const member = ws.members.find(
        (m) => m.userId.toString() === userId,
      );
      if (!member || !['owner', 'admin'].includes(member.role)) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    const invite = await this.inviteModel.findOneAndDelete({
      _id: inviteId,
      workspaceId: ws._id,
      accepted: false,
    });

    if (!invite) throw new NotFoundException('Invite not found');

    return { success: true };
  }

  async delete(id: string, userId: string, userRole?: string) {
    const ws = await this.findOne(id, userId, userRole);

    if (userRole !== 'super_admin' && ws.ownerId.toString() !== userId) {
      throw new ForbiddenException('Only owner can delete');
    }

    await this.wsModel.findByIdAndUpdate(id, { isActive: false });

    await this.auditService.log({
      userId,
      action: AuditAction.WORKSPACE_DELETED,
      resourceId: ws._id.toString(),
      resourceType: 'workspace',
      metadata: { name: ws.name, isSuperAdmin: userRole === 'super_admin' },
    });

    return { success: true };
  }

  private async enforceEnterprisePlan(ownerId: string): Promise<void> {
    const user: any = await this.userModel
      .findById(ownerId)
      .select('plan')
      .lean();

    if (!user) throw new NotFoundException('Workspace owner not found');

    if (user.plan !== 'enterprise') {
      throw new ForbiddenException(
        'Team invitations require an Enterprise plan. ' +
        'Upgrade to Enterprise to add team members to your workspace.',
      );
    }
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async processAcceptInvite(invite: any, userId: string) {
    const ws = await this.wsModel.findById(invite.workspaceId);
    if (!ws) throw new NotFoundException('Workspace not found');

    const already = ws.members.some(
      (m) => m.userId.toString() === userId,
    );
    if (already) throw new ConflictException('Already a member');

    ws.members.push({
      userId: new Types.ObjectId(userId),
      role: invite.role,
      joinedAt: new Date(),
    } as any);
    await ws.save();

    await this.inviteModel.findByIdAndUpdate(invite._id, { accepted: true });

    await this.auditService.log({
      userId,
      action: AuditAction.MEMBER_JOINED,
      resourceId: ws._id.toString(),
      resourceType: 'workspace',
      metadata: {
        email: invite.email,
        role: invite.role,
        method: invite.otp ? 'otp' : 'token',
      },
    });

    return ws;
  }
}
