import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException, NotFoundException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

/**
 * ProjectAccessGuard — resource-scoped RBAC role resolver.
 *
 * This guard sits AFTER AuthGuard('jwt') and BEFORE PermissionGuard.
 * It extracts projectId from route params, looks up the user's membership,
 * and sets request.projectRole / request.workspaceRole for PermissionGuard.
 *
 * Special: projectId === "default" is resolved to the user's first real project.
 * If no project exists yet, one is auto-created (seamless onboarding).
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
    let projectId = request.params?.projectId;
    if (!projectId) {
      // No projectId in route — skip guard (controller doesn't need project scope)
      return true;
    }

    // ── Resolve "default" → user's first real project ───────────────────────
    // The frontend sends "default" as a placeholder. We resolve it to the
    // user's actual first project, creating one if none exists yet.
    if (projectId === 'default') {
      const resolved = await this.resolveDefaultProject(userId, user.role);
      if (!resolved) {
        throw new NotFoundException('No project found. Please create a project first.');
      }
      projectId = resolved._id.toString();
      // Rewrite the param so downstream controllers see the real ID
      request.params.projectId = projectId;
      this.logger.verbose(`Resolved "default" → project ${projectId} for user ${userId}`);
    }

    // ── Validate projectId is a valid ObjectId ──────────────────────────────
    if (!Types.ObjectId.isValid(projectId)) {
      throw new NotFoundException(`Project "${projectId}" not found`);
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

  // ── Resolve "default" projectId to the user's actual first project ────────
  private async resolveDefaultProject(userId: string, userRole?: string): Promise<any> {
    // Super admin: get ANY first project (they have god-mode anyway)
    if (userRole === 'super_admin') {
      let project = await this.projectModel
        .findOne({ deletedAt: null })
        .sort({ createdAt: 1 })
        .select('_id')
        .lean();
      if (!project) {
        // Auto-create a default project for super admin
        project = await this.projectModel.create({
          name: 'Default Project',
          description: 'Auto-created default project',
          ownerId: userId,
        });
        this.logger.log(`Auto-created default project for super_admin ${userId}`);
      }
      return project;
    }

    // Regular user: find their owned or member project
    let project = await this.projectModel
      .findOne({
        $or: [{ ownerId: userId }, { 'members.userId': userId }],
        deletedAt: null,
      })
      .sort({ createdAt: 1 })
      .select('_id')
      .lean();

    if (!project) {
      // Auto-create a default project for new users (seamless onboarding)
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
