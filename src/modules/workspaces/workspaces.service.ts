import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Workspace, WorkspaceDocument, WorkspaceInvite, MemberRole } from './schemas/workspace.schema';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectModel(Workspace.name) private wsModel: Model<WorkspaceDocument>,
    @InjectModel(WorkspaceInvite.name) private inviteModel: Model<any>,
  ) {}

  async create(userId: string, dto: any) {
    const slug = (dto.name as string).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36);
    const ws = await this.wsModel.create({
      name: dto.name, slug, description: dto.description,
      ownerId: new Types.ObjectId(userId),
      members: [{ userId: new Types.ObjectId(userId), role: MemberRole.OWNER, joinedAt: new Date() }],
    });
    return ws;
  }

  async findAllForUser(userId: string) {
    return this.wsModel.find({ 'members.userId': new Types.ObjectId(userId), isActive: true }).sort({ createdAt: -1 });
  }

  async findOne(id: string, userId: string) {
    const ws = await this.wsModel.findById(id);
    if (!ws) throw new NotFoundException('Workspace not found');
    const isMember = ws.members.some(m => m.userId.toString() === userId);
    if (!isMember) throw new ForbiddenException('Not a member');
    return ws;
  }

  async update(id: string, userId: string, dto: any) {
    const ws = await this.findOne(id, userId);
    const member = ws.members.find(m => m.userId.toString() === userId);
    if (!member || !['owner', 'admin'].includes(member.role)) throw new ForbiddenException('Insufficient permissions');
    return this.wsModel.findByIdAndUpdate(id, { $set: dto }, { new: true });
  }

  async invite(id: string, userId: string, dto: { email: string; role: MemberRole }) {
    const ws = await this.findOne(id, userId);
    const member = ws.members.find(m => m.userId.toString() === userId);
    if (!member || !['owner', 'admin'].includes(member.role)) throw new ForbiddenException('Insufficient permissions');
    const token = uuidv4();
    const invite = await this.inviteModel.create({
      workspaceId: ws._id, email: dto.email.toLowerCase(), role: dto.role,
      token, invitedBy: new Types.ObjectId(userId),
    });
    return { invite, inviteUrl: `${process.env.FRONTEND_URL}/invite/${token}` };
  }

  async acceptInvite(token: string, userId: string) {
    const invite = await this.inviteModel.findOne({ token, accepted: false });
    if (!invite) throw new NotFoundException('Invalid or expired invite');
    if (new Date() > invite.expiresAt) throw new ForbiddenException('Invite expired');
    const ws = await this.wsModel.findById(invite.workspaceId);
    if (!ws) throw new NotFoundException('Workspace not found');
    const already = ws.members.some(m => m.userId.toString() === userId);
    if (already) throw new ConflictException('Already a member');
    ws.members.push({ userId: new Types.ObjectId(userId), role: invite.role, joinedAt: new Date() });
    await ws.save();
    await this.inviteModel.findByIdAndUpdate(invite._id, { accepted: true });
    return ws;
  }

  async removeMember(id: string, userId: string, targetUserId: string) {
    const ws = await this.findOne(id, userId);
    const requester = ws.members.find(m => m.userId.toString() === userId);
    if (!requester || !['owner', 'admin'].includes(requester.role)) throw new ForbiddenException('Insufficient permissions');
    if (targetUserId === ws.ownerId.toString()) throw new ForbiddenException('Cannot remove owner');
    await this.wsModel.findByIdAndUpdate(id, { $pull: { members: { userId: new Types.ObjectId(targetUserId) } } });
    return { success: true };
  }

  async updateMemberRole(id: string, userId: string, targetUserId: string, role: MemberRole) {
    const ws = await this.findOne(id, userId);
    const requester = ws.members.find(m => m.userId.toString() === userId);
    if (!requester || requester.role !== MemberRole.OWNER) throw new ForbiddenException('Only owner can change roles');
    await this.wsModel.updateOne({ _id: id, 'members.userId': new Types.ObjectId(targetUserId) }, { $set: { 'members.$.role': role } });
    return { success: true };
  }

  async listInvites(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.inviteModel.find({ workspaceId: id, accepted: false }).sort({ createdAt: -1 });
  }

  async delete(id: string, userId: string) {
    const ws = await this.findOne(id, userId);
    if (ws.ownerId.toString() !== userId) throw new ForbiddenException('Only owner can delete');
    await this.wsModel.findByIdAndUpdate(id, { isActive: false });
    return { success: true };
  }
}
