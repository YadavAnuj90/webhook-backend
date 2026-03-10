// roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../modules/users/schemas/user.schema';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = ctx.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Not authenticated');

    // Role hierarchy: super_admin > admin > developer > viewer
    const hierarchy = [UserRole.VIEWER, UserRole.DEVELOPER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
    const userLevel = hierarchy.indexOf(user.role);
    const requiredLevel = Math.min(...required.map(r => hierarchy.indexOf(r)));

    if (userLevel < requiredLevel) {
      throw new ForbiddenException(`Requires role: ${required.join(' or ')}`);
    }
    return true;
  }
}
