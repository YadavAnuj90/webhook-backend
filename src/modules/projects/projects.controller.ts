// projects.controller.ts
import {
  Controller, Get, Post, Put, Delete, Param, Body,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
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
  create(@Body() dto: CreateProjectDto, @Request() req: any) {
    return this.projectsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all projects you belong to' })
  findAll(@Request() req: any) {
    return this.projectsService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project details' })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.findOne(id, req.user.id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update project settings' })
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @Request() req: any) {
    return this.projectsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete project (owner only)' })
  delete(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.delete(id, req.user.id);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add member to project' })
  addMember(
    @Param('id') id: string,
    @Body() body: { userId: string; role: string },
    @Request() req: any,
  ) {
    return this.projectsService.addMember(id, req.user.id, body.userId, body.role);
  }
}
