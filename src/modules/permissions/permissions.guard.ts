import {
  Injectable, CanActivate, ExecutionContext,
  SetMetadata, ForbiddenException, Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Resource, Action } from './permissions.constants';
import { PermissionsService } from './permissions.service';

export const PERMISSION_KEY = 'required_permission';

export const RequirePermission = (resource: Resource, action: Action) =>
  SetMetadata(PERMISSION_KEY, { resource, action });

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

    if (!requirement) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');

    if (user.role === 'super_admin') {
      this.logger.verbose(
        `[GOD-MODE] super_admin ${user.email || user.id} → ${requirement.resource}:${requirement.action}`,
      );
      return true;
    }

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
