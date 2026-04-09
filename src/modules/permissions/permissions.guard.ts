import {
  Injectable, CanActivate, ExecutionContext,
  SetMetadata, ForbiddenException,
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
 * How role resolution works:
 * 1. Check request.projectRole (set by project-access middleware/guard)
 * 2. Fall back to user.role (global role from JWT)
 * 3. If no permission metadata on route → allow (backward compat)
 *
 * This guard must be used AFTER AuthGuard('jwt') in the guard chain.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
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

    // Resolve role: project-level role takes precedence over global role
    const role = request.projectRole || request.memberRole || user.role;

    const allowed = await this.permissionsService.hasPermission(
      role,
      requirement.resource,
      requirement.action,
    );

    if (!allowed) {
      throw new ForbiddenException(
        `You don't have permission to ${requirement.action} ${requirement.resource}. ` +
        `Required: ${requirement.resource}:${requirement.action}`,
      );
    }

    return true;
  }
}
