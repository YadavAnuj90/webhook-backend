import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiQuery, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { EventsService } from './events.service';
import { EventStatus } from './schemas/event.schema';
import { SendEventToEndpointDto } from './dto/send-event.dto';

@ApiTags('Events')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Post('send')
  @ApiOperation({ summary: 'Send a webhook event to a specific endpoint' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiBody({ schema: { required: ['endpointId', 'eventType', 'payload'], properties: { endpointId: { type: 'string' }, eventType: { type: 'string', example: 'payment.success' }, payload: { type: 'object' }, idempotencyKey: { type: 'string', description: 'Optional deduplication key' } } } })
  @ApiResponse({ status: 201, description: 'Event queued for delivery' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Project or endpoint not found' })
  send(@Param('projectId') projectId: string, @Body() dto: SendEventToEndpointDto) {
    return this.eventsService.send(projectId, dto.endpointId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List events for a project with pagination and filtering' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: EventStatus, description: 'Filter by event status' })
  @ApiQuery({ name: 'endpointId', required: false, type: String, description: 'Filter by endpoint' })
  @ApiResponse({ status: 200, description: 'Paginated list of events' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  findAll(@Param('projectId') projectId: string, @Query('page') page = 1, @Query('limit') limit = 20, @Query('status') status?: EventStatus, @Query('endpointId') endpointId?: string) {
    return this.eventsService.findAll(projectId, +page, +limit, status, endpointId);
  }

  @Get('dlq')
  @ApiOperation({ summary: 'Get dead letter queue events for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated list of dead letter queue events' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getDlq(@Param('projectId') projectId: string, @Query('page') page = 1, @Query('limit') limit = 20) {
    return this.eventsService.getDlq(projectId, +page, +limit);
  }

  @Post('dlq/replay-all')
  @ApiOperation({ summary: 'Replay all events in the dead letter queue' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiResponse({ status: 200, description: 'All DLQ events re-queued for delivery' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  replayDlq(@Param('projectId') projectId: string) {
    return this.eventsService.replayDlq(projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full details for a single event including delivery attempts' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Event ID', type: String })
  @ApiResponse({ status: 200, description: 'Event details with delivery logs' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.eventsService.findOne(id, projectId);
  }

  @Post(':id/replay')
  @ApiOperation({ summary: 'Replay a single event (re-queue for delivery)' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Event ID', type: String })
  @ApiResponse({ status: 200, description: 'Event re-queued for delivery' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  replay(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.eventsService.replay(id, projectId);
  }

  // GDPR Right-to-Erasure
  @Delete('erase')
  @ApiOperation({ summary: 'GDPR: erase all events and delivery logs containing a specific customerId' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiQuery({ name: 'customerId', required: true, type: String, description: 'Customer ID to erase from all events' })
  @ApiResponse({ status: 200, description: 'All matching events and logs erased' })
  @ApiResponse({ status: 400, description: 'customerId query param is required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async erase(
    @Param('projectId') projectId: string,
    @Query('customerId') customerId: string,
  ) {
    return this.eventsService.eraseByCustomerId(projectId, customerId);
  }
}
