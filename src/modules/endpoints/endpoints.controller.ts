import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiQuery, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { EndpointsService } from './endpoints.service';
import { EndpointStatus } from './schemas/endpoint.schema';
import { CreateEndpointDto, UpdateEndpointDto } from './dto/create-endpoint.dto';

@ApiTags('Endpoints')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/endpoints')
export class EndpointsController {
  constructor(private endpointsService: EndpointsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new webhook endpoint for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiBody({ schema: { required: ['url'], properties: { url: { type: 'string', example: 'https://example.com/webhook' }, name: { type: 'string' }, description: { type: 'string' }, method: { type: 'string', enum: ['POST', 'PUT', 'PATCH'], default: 'POST' }, headers: { type: 'object' }, retryPolicy: { type: 'object', properties: { maxAttempts: { type: 'number', default: 5 }, initialDelay: { type: 'number', default: 1000 } } }, filterEventTypes: { type: 'array', items: { type: 'string' } }, piiFields: { type: 'array', items: { type: 'string' } } } } })
  @ApiResponse({ status: 201, description: 'Endpoint created with generated signing secret' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  create(@Param('projectId') projectId: string, @Body() dto: CreateEndpointDto, @Request() req: any) {
    return this.endpointsService.create(projectId, dto, req.user?.userId || req.user?.id);
  }

  @Get()
  @ApiOperation({ summary: 'List all endpoints for a project with pagination' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: EndpointStatus })
  @ApiResponse({ status: 200, description: 'Paginated list of endpoints' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(@Param('projectId') projectId: string, @Query('page') page = 1, @Query('limit') limit = 20, @Query('status') status?: EndpointStatus) {
    return this.endpointsService.findAll(projectId, +page, +limit, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single endpoint by ID' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Endpoint ID', type: String })
  @ApiResponse({ status: 200, description: 'Endpoint details' })
  @ApiResponse({ status: 404, description: 'Endpoint not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.findOne(id, projectId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update endpoint configuration (URL, headers, retry policy, etc.)' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Endpoint ID', type: String })
  @ApiResponse({ status: 200, description: 'Updated endpoint' })
  @ApiResponse({ status: 404, description: 'Endpoint not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: UpdateEndpointDto) {
    return this.endpointsService.update(id, projectId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an endpoint permanently' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Endpoint ID', type: String })
  @ApiResponse({ status: 200, description: 'Endpoint deleted' })
  @ApiResponse({ status: 404, description: 'Endpoint not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  delete(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.delete(id, projectId);
  }

  @Post(':id/rotate-secret')
  @ApiOperation({ summary: 'Rotate the HMAC signing secret for an endpoint' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Endpoint ID', type: String })
  @ApiResponse({ status: 200, description: 'New signing secret returned (shown once only)' })
  @ApiResponse({ status: 404, description: 'Endpoint not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  rotateSecret(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.rotateSecret(id, projectId);
  }

  @Patch(':id/pause')
  @ApiOperation({ summary: 'Pause an endpoint — queued events will be held, not delivered' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Endpoint ID', type: String })
  @ApiResponse({ status: 200, description: 'Endpoint paused' })
  @ApiResponse({ status: 404, description: 'Endpoint not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  pause(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.pause(id, projectId);
  }

  @Patch(':id/resume')
  @ApiOperation({ summary: 'Resume a paused endpoint' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Endpoint ID', type: String })
  @ApiResponse({ status: 200, description: 'Endpoint resumed and delivery restarted' })
  @ApiResponse({ status: 404, description: 'Endpoint not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  resume(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.resume(id, projectId);
  }
}
