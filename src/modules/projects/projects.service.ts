// ─── Service ─────────────────────────────────────────────────────────────────
import {
  Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Project } from './schemas/project.schema';

export class CreateProjectDto {
  @ApiProperty({ example: 'My E-Commerce App' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Link project to a workspace for inherited team access' })
  @IsOptional()
  @IsString()
  workspaceId?: string;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() maxRetryAttempts?: number;
  @IsOptional() @IsNumber() defaultTimeoutMs?: number;
  @IsOptional() @IsString() workspaceId?: string;
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectModel(Project.name) private projectModel: Model<Project>,
    @InjectModel('Workspace') private workspaceModel: Model<any>,
  ) {}

  async create(ownerId: string, dto: CreateProjectDto): Promise<Project> {
    return new this.projectModel({ ...dto, ownerId }).save();
  }

  async findAll(userId: string, userRole?: string): Promise<Project[]> {
    // Super admin sees ALL projects across all tenants
    if (userRole === 'super_admin') {
      return this.projectModel.find({ deletedAt: null }).sort({ createdAt: -1 }).exec();
    }

    // Regular users: owned + member + workspace-inherited
    const ownedOrMember = await this.projectModel.find({
      $or: [{ ownerId: userId }, { 'members.userId': userId }],
      deletedAt: null,
    }).exec();

    // Also find projects linked to workspaces where user is a member
    const workspaces = await this.workspaceModel
      .find({ 'members.userId': userId, isActive: true })
      .select('_id')
      .lean();

    if (workspaces.length > 0) {
      const wsIds = workspaces.map((w: any) => w._id.toString());
      const wsProjects = await this.projectModel.find({
        workspaceId: { $in: wsIds },
        deletedAt: null,
        ownerId: { $ne: userId },         // avoid duplicates
        'members.userId': { $ne: userId }, // avoid duplicates
      }).exec();
      return [...ownedOrMember, ...wsProjects];
    }

    return ownedOrMember;
  }

  async findOne(id: string, userId: string, userRole?: string): Promise<Project> {
    const project = await this.projectModel.findOne({ _id: id, deletedAt: null });
    if (!project) throw new NotFoundException('Project not found');

    // Super admin bypasses all access checks
    if (userRole === 'super_admin') return project;

    await this.checkAccess(project, userId);
    return project;
  }

  async update(id: string, userId: string, dto: UpdateProjectDto, userRole?: string): Promise<Project> {
    await this.findOne(id, userId, userRole);
    return this.projectModel.findByIdAndUpdate(id, dto, { new: true }) as any;
  }

  async delete(id: string, userId: string, userRole?: string): Promise<void> {
    const project = await this.projectModel.findOne({ _id: id, deletedAt: null });
    if (!project) throw new NotFoundException('Project not found');

    // Super admin can delete any project
    if (userRole === 'super_admin') {
      await this.projectModel.findByIdAndUpdate(id, { deletedAt: new Date() });
      return;
    }

    if (project.ownerId !== userId) throw new ForbiddenException('Only owner can delete');
    await this.projectModel.findByIdAndUpdate(id, { deletedAt: new Date() });
  }

  async addMember(
    projectId: string,
    requesterId: string,
    memberId: string,
    role: 'admin' | 'developer' | 'viewer',
    requesterRole?: string,
  ) {
    const project = await this.findOne(projectId, requesterId, requesterRole);

    // Only owner/admin (or super_admin) can add members
    if (requesterRole !== 'super_admin') {
      const isOwner = project.ownerId === requesterId;
      const isAdmin = project.members.some(
        m => m.userId === requesterId && ['owner', 'admin'].includes(m.role),
      );
      if (!isOwner && !isAdmin) throw new ForbiddenException('Only owner or admin can add members');
    }

    const exists = project.members.find(m => m.userId === memberId);
    if (exists) return project;

    return this.projectModel.findByIdAndUpdate(
      projectId,
      { $push: { members: { userId: memberId, role } } },
      { new: true },
    );
  }

  async removeMember(
    projectId: string,
    requesterId: string,
    targetUserId: string,
    requesterRole?: string,
  ) {
    const project = await this.findOne(projectId, requesterId, requesterRole);

    if (requesterRole !== 'super_admin') {
      const isOwner = project.ownerId === requesterId;
      const isAdmin = project.members.some(
        m => m.userId === requesterId && ['owner', 'admin'].includes(m.role),
      );
      if (!isOwner && !isAdmin) throw new ForbiddenException('Only owner or admin can remove members');
    }

    if (targetUserId === project.ownerId) throw new ForbiddenException('Cannot remove project owner');

    return this.projectModel.findByIdAndUpdate(
      projectId,
      { $pull: { members: { userId: targetUserId } } },
      { new: true },
    );
  }

  async updateMemberRole(
    projectId: string,
    requesterId: string,
    targetUserId: string,
    newRole: 'admin' | 'developer' | 'viewer',
    requesterRole?: string,
  ) {
    const project = await this.findOne(projectId, requesterId, requesterRole);

    if (requesterRole !== 'super_admin') {
      if (project.ownerId !== requesterId) {
        throw new ForbiddenException('Only project owner can change member roles');
      }
    }

    await this.projectModel.updateOne(
      { _id: projectId, 'members.userId': targetUserId },
      { $set: { 'members.$.role': newRole } },
    );
    return { success: true };
  }

  async incrementEventCount(projectId: string): Promise<void> {
    await this.projectModel.findByIdAndUpdate(projectId, {
      $inc: { currentMonthEvents: 1 },
    });
  }

  async checkEventLimit(projectId: string): Promise<boolean> {
    const project = await this.projectModel.findById(projectId);
    if (!project) return false;
    return project.currentMonthEvents < project.monthlyEventLimit;
  }

  /**
   * Resolve the user's effective role in a project.
   * Used by ProjectAccessGuard and other internal services.
   */
  async resolveRole(projectId: string, userId: string): Promise<string | null> {
    const project: any = await this.projectModel
      .findOne({ _id: projectId, deletedAt: null })
      .select('ownerId members workspaceId')
      .lean();
    if (!project) return null;

    // Owner
    if (project.ownerId === userId || project.ownerId?.toString() === userId) return 'owner';

    // Direct member
    const member = (project.members || []).find(
      (m: any) => m.userId === userId || m.userId?.toString() === userId,
    );
    if (member) return member.role;

    // Workspace-inherited
    if (project.workspaceId) {
      const ws: any = await this.workspaceModel
        .findOne({ _id: project.workspaceId, isActive: true })
        .select('members')
        .lean();
      if (ws) {
        const wsMember = (ws.members || []).find(
          (m: any) => (m.userId?.toString() || m.userId) === userId,
        );
        if (wsMember) return wsMember.role;
      }
    }

    return null;
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async checkAccess(project: Project, userId: string): Promise<void> {
    const isOwner = project.ownerId === userId;
    const isMember = project.members.some(m => m.userId === userId);

    if (isOwner || isMember) return;

    // Check workspace-inherited access
    if (project.workspaceId) {
      const ws = await this.workspaceModel
        .findOne({ _id: project.workspaceId, isActive: true, 'members.userId': userId })
        .select('_id')
        .lean();
      if (ws) return; // workspace member → access granted
    }

    throw new ForbiddenException('No access to this project');
  }
}
