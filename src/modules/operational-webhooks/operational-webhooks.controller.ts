import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { OperationalWebhooksService } from './operational-webhooks.service';
import { CreateOperationalWebhookDto, UpdateOperationalWebhookDto } from './dto/operational-webhook.dto';

@ApiTags('Operational Webhooks')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/operational-webhooks')
export class OperationalWebhooksController {
  constructor(private svc: OperationalWebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Register a system/operational webhook URL to receive platform events' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiBody({ schema: { required: ['url', 'events'], properties: { url: { type: 'string', example: 'https://your-system.com/platform-events' }, events: { type: 'array', items: { type: 'string' }, example: ['delivery.success', 'delivery.failed', 'endpoint.disabled'] }, description: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'Operational webhook registered — returns id and signing secret' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Param('projectId') p: string, @Body() dto: CreateOperationalWebhookDto) { return this.svc.create(p, dto); }

  @Get()
  @ApiOperation({ summary: 'List all operational/system webhooks for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiResponse({ status: 200, description: 'Array of operational webhooks with subscribed events' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  list(@Param('projectId') p: string) { return this.svc.list(p); }

  @Put(':id')
  @ApiOperation({ summary: 'Update operational webhook URL, subscribed events, or description' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Operational webhook ID', type: String })
  @ApiResponse({ status: 200, description: 'Updated operational webhook' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(@Param('projectId') p: string, @Param('id') id: string, @Body() dto: UpdateOperationalWebhookDto) { return this.svc.update(p, id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an operational webhook permanently' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Operational webhook ID', type: String })
  @ApiResponse({ status: 200, description: 'Operational webhook deleted' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  delete(@Param('projectId') p: string, @Param('id') id: string) { return this.svc.delete(p, id); }

  @Post(':id/rotate-secret')
  @ApiOperation({ summary: 'Rotate the HMAC signing secret for an operational webhook' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Operational webhook ID', type: String })
  @ApiResponse({ status: 200, description: 'New signing secret returned (shown once only)' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  rotate(@Param('projectId') p: string, @Param('id') id: string) { return this.svc.rotateSecret(p, id); }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send a test event to the operational webhook URL to verify connectivity' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Operational webhook ID', type: String })
  @ApiResponse({ status: 200, description: 'Test event sent — returns delivery result with status and latency' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  test(@Param('projectId') p: string, @Param('id') id: string) { return this.svc.test(p, id); }
}
