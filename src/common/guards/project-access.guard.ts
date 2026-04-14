import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException, NotFoundException, Logger, Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RedisCache } from '../cache/redis-cache.service';

const ROLE_CACHE_TTL_S = parseInt(process.env.ROLE_CACHE_TTL_S || '30', 10);

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  private readonly logger = new Logger(ProjectAccessGuard.name);

  constructor(
    @InjectModel('Project') private projectModel: Model<any>,
    @InjectModel('Workspace') private workspaceModel: Model<any>,
    @Optional() private cache?: RedisCache,
  ) {}

  private roleKey(userId: string, projectId: string) {
    return `role:${userId}:${projectId}`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');

    const userId = user.userId || user.sub || user.id;

    let projectId = request.params?.projectId;
    if (!projectId) {

      return true;
    }

    if (projectId === 'default') {
      const resolved = await this.resolveDefaultProject(userId, user.role);
      if (!resolved) {
        throw new NotFoundException('No project found. Please create a project first.');
      }
      projectId = resolved._id.toString();

      request.params.projectId = projectId;
      this.logger.verbose(`Resolved "default" → project ${projectId} for user ${userId}`);
    }

    if (!Types.ObjectId.isValid(projectId)) {
      throw new NotFoundException(`Project "${projectId}" not found`);
    }

    if (user.role === 'super_admin') {

      const exists = await this.projectModel.findOne({ _id: projectId, deletedAt: null }).select('_id').lean();
      if (!exists) throw new NotFoundException('Project not found');
      request.projectRole = 'owner';
      this.logger.verbose(`[GOD-MODE] super_admin ${userId} → project ${projectId}`);
      return true;
    }

    if (this.cache) {
      const cached = await this.cache.get<{ projectRole?: string; workspaceRole?: string }>(
        this.roleKey(userId, projectId),
      );
      if (cached) {
        if (cached.projectRole) request.projectRole = cached.projectRole;
        if (cached.workspaceRole) request.workspaceRole = cached.workspaceRole;
        return true;
      }
    }

    const project: any = await this.projectModel
      .findOne({ _id: projectId, deletedAt: null })
      .select('ownerId members workspaceId')
      .lean();

    if (!project) throw new NotFoundException('Project not found');

    const persist = (roles: { projectRole?: string; workspaceRole?: string }) => {
      if (this.cache) {
        this.cache.set(this.roleKey(userId, projectId), roles, ROLE_CACHE_TTL_S).catch(() => {});
      }
    };

    if (project.ownerId === userId || project.ownerId?.toString() === userId) {
      request.projectRole = 'owner';
      persist({ projectRole: 'owner' });
      return true;
    }

    const projectMember = (project.members || []).find(
      (m: any) => m.userId === userId || m.userId?.toString() === userId,
    );
    if (projectMember) {
      request.projectRole = projectMember.role;
      persist({ projectRole: projectMember.role });
      return true;
    }

    if (project.workspaceId) {
      const workspace: any = await this.workspaceModel
        .findOne({ _id: project.workspaceId, isActive: true })
        .select('members')
        .lean();

      if (workspace) {
        const wsMember = (workspace.members || []).find(
          (m: any) => {
            const mId = m.userId?.toString() || m.userId;
            return mId === userId;
          },
        );
        if (wsMember) {
          request.workspaceRole = wsMember.role;
          persist({ workspaceRole: wsMember.role });
          return true;
        }
      }
    }

    throw new ForbiddenException(
      'You are not a member of this project. Ask the project owner to invite you.',
    );
  }

  private async resolveDefaultProject(userId: string, userRole?: string): Promise<any> {

    if (userRole === 'super_admin') {
      let project = await this.projectModel
        .findOne({ deletedAt: null })
        .sort({ createdAt: 1 })
        .select('_id')
        .lean();
      if (!project) {

        project = await this.projectModel.create({
          name: 'Default Project',
          description: 'Auto-created default project',
          ownerId: userId,
        });
        this.logger.log(`Auto-created default project for super_admin ${userId}`);
      }
      return project;
    }

    let project = await this.projectModel
      .findOne({
        $or: [{ ownerId: userId }, { 'members.userId': userId }],
        deletedAt: null,
      })
      .sort({ createdAt: 1 })
      .select('_id')
      .lean();

    if (!project) {

      project = await this.projectModel.create({
        name: 'Default Project',
        description: 'Auto-created default project',
        ownerId: userId,
      });
      this.logger.log(`Auto-created default project for user ${userId}`);
    }

    return project;
  }
}
