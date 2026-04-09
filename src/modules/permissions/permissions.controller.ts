import {
  Controller, Post, Get, Put, Delete, Body, Param, Query,
  UseGuards, Request,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse,
  ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsService } from './permissions.service';
import { CreateCustomRoleDto, UpdateCustomRoleDto } from './dto/custom-role.dto';

@ApiTags('Permissions')
@Controller()
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT')
export class PermissionsController {
  constructor(private permissionsService: PermissionsService) {}

  // ── Permission Matrix (public reference) ──────────────────────────────────

  @Get('permissions/matrix')
  @ApiOperation({ summary: 'Get the full permission matrix for all built-in roles' })
  @ApiResponse({ status: 200, description: 'Permission matrix with resources, actions, and role mappings' })
  getPermissionMatrix() {
    return this.permissionsService.getPermissionMatrix();
  }

  @Get('permissions/roles/:role')
  @ApiOperation({ summary: 'Get all permissions for a built-in or custom role' })
  @ApiParam({ name: 'role', description: 'Built-in role name or custom role ID' })
  @ApiResponse({ status: 200, description: 'Array of permission strings' })
  getRolePermissions(@Param('role') role: string) {
    return this.permissionsService.getPermissions(role);
  }

  @Get('permissions/compare')
  @ApiOperation({ summary: 'Compare permissions between two roles' })
  @ApiQuery({ name: 'role1', description: 'First role (name or ID)' })
  @ApiQuery({ name: 'role2', description: 'Second role (name or ID)' })
  @ApiResponse({ status: 200, description: 'Permission diff between roles' })
  compareRoles(@Query('role1') role1: string, @Query('role2') role2: string) {
    return this.permissionsService.compareRoles(role1, role2);
  }

  // ── Custom Roles (per project) ────────────────────────────────────────────

  @Post('projects/:projectId/roles')
  @ApiOperation({ summary: 'Create a custom role for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 201, description: 'Custom role created' })
  @ApiResponse({ status: 400, description: 'Invalid permissions or reserved name' })
  createCustomRole(
    @Param('projectId') projectId: string,
    @Body() dto: CreateCustomRoleDto,
    @Request() req: any,
  ) {
    return this.permissionsService.createCustomRole(projectId, dto, req.user.id);
  }

  @Get('projects/:projectId/roles')
  @ApiOperation({ summary: 'List all custom roles for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Array of custom roles' })
  listCustomRoles(@Param('projectId') projectId: string) {
    return this.permissionsService.listCustomRoles(projectId);
  }

  @Get('projects/:projectId/roles/:roleId')
  @ApiOperation({ summary: 'Get a custom role by ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'roleId', description: 'Custom role ID' })
  @ApiResponse({ status: 200, description: 'Custom role details with permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  getCustomRole(
    @Param('roleId') roleId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.permissionsService.getCustomRole(roleId, projectId);
  }

  @Put('projects/:projectId/roles/:roleId')
  @ApiOperation({ summary: 'Update a custom role (name, permissions, etc.)' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'roleId', description: 'Custom role ID' })
  @ApiResponse({ status: 200, description: 'Updated custom role' })
  @ApiResponse({ status: 400, description: 'Invalid permissions' })
  updateCustomRole(
    @Param('roleId') roleId: string,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateCustomRoleDto,
  ) {
    return this.permissionsService.updateCustomRole(roleId, projectId, dto);
  }

  @Delete('projects/:projectId/roles/:roleId')
  @ApiOperation({ summary: 'Delete (deactivate) a custom role' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'roleId', description: 'Custom role ID' })
  @ApiResponse({ status: 200, description: 'Role deleted' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  deleteCustomRole(
    @Param('roleId') roleId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.permissionsService.deleteCustomRole(roleId, projectId);
  }
}
