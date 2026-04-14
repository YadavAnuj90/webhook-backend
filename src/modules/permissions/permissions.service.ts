import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Resource, Action, ProjectRole, Permission,
  ROLE_PERMISSIONS, ALL_PERMISSIONS,
} from './permissions.constants';
import { CustomRole } from './schemas/custom-role.schema';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  private roleCache = new Map<string, Set<string>>();

  constructor(
    @InjectModel(CustomRole.name) private customRoleModel: Model<CustomRole>,
  ) {}

  async hasPermission(
    role: string,
    resource: Resource,
    action: Action,
  ): Promise<boolean> {
    const permission: Permission = `${resource}:${action}`;

    if (Object.values(ProjectRole).includes(role as ProjectRole)) {
      const perms = ROLE_PERMISSIONS[role as ProjectRole] || [];
      return perms.includes(permission);
    }

    return this.hasCustomRolePermission(role, permission);
  }

  async checkPermission(
    role: string,
    resource: Resource,
    action: Action,
  ): Promise<void> {
    const allowed = await this.hasPermission(role, resource, action);
    if (!allowed) {
      throw new ForbiddenException(
        `Insufficient permissions: ${resource}:${action} requires a higher role`,
      );
    }
  }

  async getPermissions(role: string): Promise<Permission[]> {
    if (Object.values(ProjectRole).includes(role as ProjectRole)) {
      return ROLE_PERMISSIONS[role as ProjectRole];
    }

    const customRole = await this.customRoleModel.findById(role);
    if (!customRole || !customRole.isActive) return [];
    return customRole.permissions as Permission[];
  }

  async createCustomRole(
    projectId: string,
    dto: {
      name: string;
      description?: string;
      permissions: string[];
      color?: string;
    },
    userId: string,
  ) {

    const invalid = dto.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as Permission));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid permissions: ${invalid.join(', ')}. Valid format: resource:action`,
      );
    }

    const reserved = Object.values(ProjectRole);
    if (reserved.includes(dto.name.toLowerCase() as ProjectRole)) {
      throw new BadRequestException(`"${dto.name}" is a reserved role name`);
    }

    const role = await this.customRoleModel.create({
      name: dto.name,
      description: dto.description || null,
      projectId,
      permissions: dto.permissions,
      createdBy: userId,
      color: dto.color || null,
    });

    return role;
  }

  async listCustomRoles(projectId: string) {
    return this.customRoleModel.find({ projectId, isActive: true }).sort({ name: 1 });
  }

  async getCustomRole(id: string, projectId: string) {
    const role = await this.customRoleModel.findOne({ _id: id, projectId, isActive: true });
    if (!role) throw new NotFoundException('Custom role not found');
    return role;
  }

  async updateCustomRole(
    id: string,
    projectId: string,
    dto: {
      name?: string;
      description?: string;
      permissions?: string[];
      color?: string;
    },
  ) {
    const role = await this.customRoleModel.findOne({ _id: id, projectId, isActive: true });
    if (!role) throw new NotFoundException('Custom role not found');

    if (dto.permissions) {
      const invalid = dto.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as Permission));
      if (invalid.length > 0) {
        throw new BadRequestException(`Invalid permissions: ${invalid.join(', ')}`);
      }
    }

    const updates: any = {};
    if (dto.name) updates.name = dto.name;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.permissions) updates.permissions = dto.permissions;
    if (dto.color !== undefined) updates.color = dto.color;

    this.roleCache.delete(id);

    return this.customRoleModel.findByIdAndUpdate(id, updates, { new: true });
  }

  async deleteCustomRole(id: string, projectId: string) {
    const role = await this.customRoleModel.findOne({ _id: id, projectId, isActive: true });
    if (!role) throw new NotFoundException('Custom role not found');

    await this.customRoleModel.findByIdAndUpdate(id, { isActive: false });
    this.roleCache.delete(id);

    return { message: `Role "${role.name}" deleted` };
  }

  getPermissionMatrix(): {
    resources: string[];
    actions: string[];
    roles: Record<string, Record<string, string[]>>;
  } {
    const resources = Object.values(Resource);
    const actions = Object.values(Action);

    const roles: Record<string, Record<string, string[]>> = {};
    for (const role of Object.values(ProjectRole)) {
      roles[role] = {};
      for (const resource of resources) {
        roles[role][resource] = actions.filter((action) =>
          ROLE_PERMISSIONS[role].includes(`${resource}:${action}` as Permission),
        );
      }
    }

    return { resources, actions, roles };
  }

  async compareRoles(
    role1: string,
    role2: string,
  ): Promise<{ onlyInRole1: string[]; onlyInRole2: string[]; shared: string[] }> {
    const perms1 = new Set(await this.getPermissions(role1));
    const perms2 = new Set(await this.getPermissions(role2));

    return {
      onlyInRole1: [...perms1].filter((p) => !perms2.has(p)),
      onlyInRole2: [...perms2].filter((p) => !perms1.has(p)),
      shared: [...perms1].filter((p) => perms2.has(p)),
    };
  }

  private async hasCustomRolePermission(roleId: string, permission: string): Promise<boolean> {

    const cached = this.roleCache.get(roleId);
    if (cached) return cached.has(permission);

    const role = await this.customRoleModel.findById(roleId);
    if (!role || !role.isActive) return false;

    const permSet = new Set(role.permissions);
    this.roleCache.set(roleId, permSet);

    return permSet.has(permission);
  }
}
