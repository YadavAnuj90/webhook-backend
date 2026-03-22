// projects.controller.ts
import {
  Controller, Get, Post, Put, Delete, Param, Body,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ProjectsService, CreateProjectDto, UpdateProjectDto } from './projects.service';

@ApiTags('Projects')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project (tenant)' })
  @ApiBody({ schema: { required: ['name'], properties: { name: { type: 'string', example: 'My Project' }, description: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'Project created with default settings' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Body() dto: CreateProjectDto, @Request() req: any) {
    return this.projectsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all projects you belong to (owned and member)' })
  @ApiResponse({ status: 200, description: 'Array of projects with role and quota info' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(@Request() req: any) {
    return this.projectsService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project details including members and quota usage' })
  @ApiParam({ name: 'id', description: 'Project ID', type: String })
  @ApiResponse({ status: 200, description: 'Project details' })
  @ApiResponse({ status: 404, description: 'Project not found or no access' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.findOne(id, req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update project settings (owner only)' })
  @ApiParam({ name: 'id', description: 'Project ID', type: String })
  @ApiBody({ schema: { properties: { name: { type: 'string' }, description: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Updated project' })
  @ApiResponse({ status: 403, description: 'Forbidden — owner only' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @Request() req: any) {
    return this.projectsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete project and all its data (owner only)' })
  @ApiParam({ name: 'id', description: 'Project ID', type: String })
  @ApiResponse({ status: 204, description: 'Project deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden — owner only' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  delete(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.delete(id, req.user.id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to the project' })
  @ApiParam({ name: 'id', description: 'Project ID', type: String })
  @ApiBody({ schema: { required: ['userId', 'role'], properties: { userId: { type: 'string' }, role: { type: 'string', enum: ['admin', 'developer', 'viewer'] } } } })
  @ApiResponse({ status: 201, description: 'Member added' })
  @ApiResponse({ status: 403, description: 'Forbidden — owner/admin only' })
  @ApiResponse({ status: 404, description: 'Project or user not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  addMember(
    @Param('id') id: string,
    @Body() body: { userId: string; role: string },
    @Request() req: any,
  ) {
    return this.projectsService.addMember(id, req.user.id, body.userId, body.role);
  }
}
