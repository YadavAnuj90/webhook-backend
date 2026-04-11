import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException, NotFoundException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

/**
 * ProjectAccessGuard — resource-scoped RBAC role resolver.
 *
 * This guard sits AFTER AuthGuard('jwt') and BEFORE PermissionGuard.
 * It extracts projectId from route params, looks up the user's membership,
 * and sets request.projectRole / request.workspaceRole for PermissionGuard.
 *
 * Role resolution chain:
 * 1. super_admin → sets request.projectRole = 'owner' (god-mode, logged)
 * 2. Project.ownerId matches → sets request.projectRole = 'owner'
 * 3. Project.members contains user → sets request.projectRole = member.role
 * 4. Project.workspaceId → check Workspace.members → sets request.workspaceRole
 * 5. None of the above → ForbiddenException
 *
 * Usage:
 *   @UseGuards(AuthGuard('jwt'), ProjectAccessGuard, PermissionGuard)
 *   @RequirePermission(Resource.ENDPOINTS, Action.CREATE)
 *   @Post()
 *   create() { ... }
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  private readonly logger = new Logger(ProjectAccessGuard.name);

  constructor(
    @InjectModel('Project') private projectModel: Model<any>,
    @InjectModel('Workspace') private workspaceModel: Model<any>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');

    const userId = user.userId || user.sub || user.id;

    // ── Extract projectId from route params ─────────────────────────────────
    const projectId = request.params?.projectId;
    if (!projectId) {
      // No projectId in route — skip guard (controller doesn't need project scope)
      return true;
    }

    // ── SUPER ADMIN GOD-MODE ────────────────────────────────────────────────
    if (user.role === 'super_admin') {
      // Verify project exists (even god-mode shouldn't access phantom resources)
      const exists = await this.projectModel.findOne({ _id: projectId, deletedAt: null }).select('_id').lean();
      if (!exists) throw new NotFoundException('Project not found');
      request.projectRole = 'owner'; // Grant full permissions
      this.logger.verbose(`[GOD-MODE] super_admin ${userId} → project ${projectId}`);
      return true;
    }

    // ── Load project ────────────────────────────────────────────────────────
    const project: any = await this.projectModel
      .findOne({ _id: projectId, deletedAt: null })
      .select('ownerId members workspaceId')
      .lean();

    if (!project) throw new NotFoundException('Project not found');

    // ── Check 1: Is user the project owner? ─────────────────────────────────
    if (project.ownerId === userId || project.ownerId?.toString() === userId) {
      request.projectRole = 'owner';
      return true;
    }

    // ── Check 2: Is user a direct project member? ───────────────────────────
    const projectMember = (project.members || []).find(
      (m: any) => m.userId === userId || m.userId?.toString() === userId,
    );
    if (projectMember) {
      request.projectRole = projectMember.role;
      return true;
    }

    // ── Check 3: Is user a workspace member? (inherited access) ─────────────
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
          return true;
        }
      }
    }

    // ── No access ───────────────────────────────────────────────────────────
    throw new ForbiddenException(
      'You are not a member of this project. Ask the project owner to invite you.',
    );
  }
}
