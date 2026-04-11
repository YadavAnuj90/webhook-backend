import {
  Injectable, CanActivate, ExecutionContext,
  SetMetadata, ForbiddenException, Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Resource, Action } from './permissions.constants';
import { PermissionsService } from './permissions.service';

/**
 * Decorator: @RequirePermission(Resource.EVENTS, Action.EXECUTE)
 *
 * Usage:
 *   @UseGuards(AuthGuard('jwt'), PermissionGuard)
 *   @RequirePermission(Resource.EVENTS, Action.EXECUTE)
 *   @Post('replay')
 *   replayEvent() { ... }
 */
export const PERMISSION_KEY = 'required_permission';

export const RequirePermission = (resource: Resource, action: Action) =>
  SetMetadata(PERMISSION_KEY, { resource, action });

/**
 * PermissionGuard — checks fine-grained RBAC permissions.
 *
 * Role resolution order (resource-scoped RBAC):
 * 1. Super admin (user.role === 'super_admin') → ALWAYS ALLOWED (god-mode)
 * 2. request.projectRole (set by ProjectAccessGuard from project.members)
 * 3. request.workspaceRole (set by ProjectAccessGuard from workspace.members)
 * 4. Deny if no role resolved
 *
 * IMPORTANT: Super admin bypass is logged — god-mode ≠ invisible mode.
 * This guard must be used AFTER AuthGuard('jwt') in the guard chain.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<{
      resource: Resource;
      action: Action;
    } | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No permission annotation → allow (backward compat with existing routes)
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');

    // ── SUPER ADMIN GOD-MODE BYPASS ──────────────────────────────────────────
    // Super admin has unrestricted access to ALL resources across ALL tenants.
    // Actions are still logged via LoggingInterceptor — god-mode ≠ invisible.
    if (user.role === 'super_admin') {
      this.logger.verbose(
        `[GOD-MODE] super_admin ${user.email || user.id} → ${requirement.resource}:${requirement.action}`,
      );
      return true;
    }

    // ── Resource-scoped role resolution ──────────────────────────────────────
    // Priority: per-project role > per-workspace role > deny
    // Global user.role is NOT used for resource access (no global admin/developer)
    const role = request.projectRole || request.workspaceRole;

    if (!role) {
      throw new ForbiddenException(
        'No access to this resource. You must be a member of the project or workspace.',
      );
    }

    const allowed = await this.permissionsService.hasPermission(
      role,
      requirement.resource,
      requirement.action,
    );

    if (!allowed) {
      throw new ForbiddenException(
        `You don't have permission to ${requirement.action} ${requirement.resource}. ` +
        `Your role "${role}" does not include ${requirement.resource}:${requirement.action}.`,
      );
    }

    return true;
  }
}
