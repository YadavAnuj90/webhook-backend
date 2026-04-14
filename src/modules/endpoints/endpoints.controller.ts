import {
  Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, UseGuards, Request,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiQuery, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { EndpointsService } from './endpoints.service';
import { EndpointStatus } from './schemas/endpoint.schema';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/create-endpoint.dto';
import { ProjectAccessGuard } from '../../common/guards/project-access.guard';
import { PermissionGuard, RequirePermission } from '../permissions/permissions.guard';
import { Resource, Action } from '../permissions/permissions.constants';

@ApiTags('Endpoints')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), ProjectAccessGuard, PermissionGuard)
@Controller('projects/:projectId/endpoints')
export class EndpointsController {
  constructor(private endpointsService: EndpointsService) {}

  @Post()
  @RequirePermission(Resource.ENDPOINTS, Action.CREATE)
  @ApiOperation({ summary: 'Create a new webhook endpoint for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiResponse({ status: 201, description: 'Endpoint created with generated signing secret' })
  create(@Param('projectId') projectId: string, @Body() dto: CreateEndpointDto, @Request() req: any) {
    return this.endpointsService.create(projectId, dto, req.user?.userId || req.user?.id);
  }

  @Get()
  @RequirePermission(Resource.ENDPOINTS, Action.READ)
  @ApiOperation({ summary: 'List all endpoints for a project with pagination' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: EndpointStatus })
  findAll(@Param('projectId') projectId: string, @Query('page') page = 1, @Query('limit') limit = 20, @Query('status') status?: EndpointStatus) {
    return this.endpointsService.findAll(projectId, +page, +limit, status);
  }

  @Get(':id')
  @RequirePermission(Resource.ENDPOINTS, Action.READ)
  @ApiOperation({ summary: 'Get a single endpoint by ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Endpoint ID', type: String })
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.findOne(id, projectId);
  }

  @Put(':id')
  @RequirePermission(Resource.ENDPOINTS, Action.UPDATE)
  @ApiOperation({ summary: 'Update endpoint configuration' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Endpoint ID', type: String })
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateEndpointDto) {
    return this.endpointsService.update(id, projectId, dto);
  }

  @Delete(':id')
  @RequirePermission(Resource.ENDPOINTS, Action.DELETE)
  @ApiOperation({ summary: 'Delete an endpoint permanently' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Endpoint ID', type: String })
  delete(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.delete(id, projectId);
  }

  @Post(':id/rotate-secret')
  @RequirePermission(Resource.ENDPOINTS, Action.EXECUTE)
  @ApiOperation({ summary: 'Rotate the HMAC signing secret for an endpoint' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Endpoint ID', type: String })
  rotateSecret(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.rotateSecret(id, projectId);
  }

  @Patch(':id/pause')
  @RequirePermission(Resource.ENDPOINTS, Action.UPDATE)
  @ApiOperation({ summary: 'Pause an endpoint' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Endpoint ID', type: String })
  pause(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.pause(id, projectId);
  }

  @Patch(':id/resume')
  @RequirePermission(Resource.ENDPOINTS, Action.UPDATE)
  @ApiOperation({ summary: 'Resume a paused endpoint' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Endpoint ID', type: String })
  resume(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.resume(id, projectId);
  }
}
