import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiQuery, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { EventsService } from './events.service';
import { EventStatus } from './schemas/event.schema';
import { SendEventToEndpointDto } from './dto/send-event.dto';
import { ProjectAccessGuard } from '../../common/guards/project-access.guard';
import { PermissionGuard, RequirePermission } from '../permissions/permissions.guard';
import { Resource, Action } from '../permissions/permissions.constants';

/**
 * EventsController — resource-scoped RBAC via ProjectAccessGuard.
 *
 * Guard chain: JWT → ProjectAccessGuard (resolves role) → PermissionGuard (checks permission)
 * Super admin bypasses all checks via god-mode in both guards.
 */
@ApiTags('Events')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), ProjectAccessGuard, PermissionGuard)
@Controller('projects/:projectId/events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Post('send')
  @RequirePermission(Resource.EVENTS, Action.CREATE)
  @ApiOperation({ summary: 'Send a webhook event to a specific endpoint' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiBody({ schema: { required: ['endpointId', 'eventType', 'payload'], properties: { endpointId: { type: 'string' }, eventType: { type: 'string', example: 'payment.success' }, payload: { type: 'object' }, idempotencyKey: { type: 'string', description: 'Optional deduplication key' } } } })
  @ApiResponse({ status: 201, description: 'Event queued for delivery' })
  send(@Param('projectId') projectId: string, @Body() dto: SendEventToEndpointDto) {
    return this.eventsService.send(projectId, dto.endpointId as string, dto);
  }

  @Get()
  @RequirePermission(Resource.EVENTS, Action.READ)
  @ApiOperation({ summary: 'List events for a project with pagination and filtering' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: EventStatus })
  @ApiQuery({ name: 'endpointId', required: false, type: String })
  findAll(@Param('projectId') projectId: string, @Query('page') page = 1, @Query('limit') limit = 20, @Query('status') status?: EventStatus, @Query('endpointId') endpointId?: string) {
    return this.eventsService.findAll(projectId, +page, +limit, status, endpointId);
  }

  @Get('dlq')
  @RequirePermission(Resource.DLQ, Action.READ)
  @ApiOperation({ summary: 'Get dead letter queue events for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  getDlq(@Param('projectId') projectId: string, @Query('page') page = 1, @Query('limit') limit = 20) {
    return this.eventsService.getDlq(projectId, +page, +limit);
  }

  @Post('dlq/replay-all')
  @RequirePermission(Resource.DLQ, Action.EXECUTE)
  @ApiOperation({ summary: 'Replay all events in the dead letter queue' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  replayDlq(@Param('projectId') projectId: string) {
    return this.eventsService.replayDlq(projectId);
  }

  @Get(':id')
  @RequirePermission(Resource.EVENTS, Action.READ)
  @ApiOperation({ summary: 'Get full details for a single event' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Event ID', type: String })
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.eventsService.findOne(id, projectId);
  }

  @Post(':id/replay')
  @RequirePermission(Resource.EVENTS, Action.EXECUTE)
  @ApiOperation({ summary: 'Replay a single event (re-queue for delivery)' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Event ID', type: String })
  replay(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.eventsService.replay(id, projectId);
  }

  @Delete('erase')
  @RequirePermission(Resource.EVENTS, Action.DELETE)
  @ApiOperation({ summary: 'GDPR: erase all events containing a specific customerId' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiQuery({ name: 'customerId', required: true, type: String })
  async erase(
    @Param('projectId') projectId: string,
    @Query('customerId') customerId: string,
  ) {
    return this.eventsService.eraseByCustomerId(projectId, customerId);
  }
}
