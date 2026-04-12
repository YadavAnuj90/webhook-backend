// projects.controller.ts
import {
  Controller, Get, Post, Put, Delete, Patch, Param, Body,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ProjectsService, CreateProjectDto, UpdateProjectDto } from './projects.service';
import { AddMemberDto } from './dto/project.dto';

@ApiTags('Projects')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project (Application / tenant)' })
  @ApiBody({ schema: { required: ['name'], properties: { name: { type: 'string', example: 'My Project' }, description: { type: 'string' }, workspaceId: { type: 'string', description: 'Link to workspace for inherited team access' } } } })
  @ApiResponse({ status: 201, description: 'Project created with default settings' })
  create(@Body() dto: CreateProjectDto, @Request() req: any) {
    return this.projectsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all projects you have access to (owned + member + workspace-inherited)' })
  @ApiResponse({ status: 200, description: 'Array of projects' })
  findAll(@Request() req: any) {
    return this.projectsService.findAll(req.user.id, req.user.role);
  }

  @Get('my-default')
  @ApiOperation({ summary: 'Get the user\'s default project (first owned/member project, auto-creates if none)' })
  @ApiResponse({ status: 200, description: 'Default project details' })
  async myDefault(@Request() req: any) {
    return this.projectsService.resolveDefault(req.user.id, req.user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project details including members and quota usage' })
  @ApiParam({ name: 'id', description: 'Project ID', type: String })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.findOne(id, req.user.id, req.user.role);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update project settings (owner/admin only)' })
  @ApiParam({ name: 'id', description: 'Project ID', type: String })
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @Request() req: any) {
    return this.projectsService.update(id, req.user.id, dto, req.user.role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete project (owner/super_admin only)' })
  @ApiParam({ name: 'id', description: 'Project ID', type: String })
  delete(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.delete(id, req.user.id, req.user.role);
  }

  // ── Per-Project Member Management (resource-scoped RBAC) ──────────────────

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to the project with a specific role' })
  @ApiParam({ name: 'id', description: 'Project ID', type: String })
  @ApiBody({ schema: { required: ['userId', 'role'], properties: { userId: { type: 'string' }, role: { type: 'string', enum: ['admin', 'developer', 'viewer'] } } } })
  addMember(@Param('id') id: string, @Body() dto: AddMemberDto, @Request() req: any) {
    return this.projectsService.addMember(id, req.user.id, dto.userId, dto.role, req.user.role);
  }

  @Delete(':id/members/:uid')
  @ApiOperation({ summary: 'Remove a member from the project' })
  @ApiParam({ name: 'id', description: 'Project ID', type: String })
  @ApiParam({ name: 'uid', description: 'User ID to remove', type: String })
  removeMember(@Param('id') id: string, @Param('uid') uid: string, @Request() req: any) {
    return this.projectsService.removeMember(id, req.user.id, uid, req.user.role);
  }

  @Patch(':id/members/:uid/role')
  @ApiOperation({ summary: 'Update a member\'s role in the project' })
  @ApiParam({ name: 'id', description: 'Project ID', type: String })
  @ApiParam({ name: 'uid', description: 'Target user ID', type: String })
  @ApiBody({ schema: { required: ['role'], properties: { role: { type: 'string', enum: ['admin', 'developer', 'viewer'] } } } })
  updateMemberRole(
    @Param('id') id: string,
    @Param('uid') uid: string,
    @Body('role') role: 'admin' | 'developer' | 'viewer',
    @Request() req: any,
  ) {
    return this.projectsService.updateMemberRole(id, req.user.id, uid, role, req.user.role);
  }
}
