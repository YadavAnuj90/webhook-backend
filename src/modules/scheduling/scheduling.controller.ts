import {
  Controller, Post, Get, Put, Delete, Body, Param, Query,
  UseGuards, Request,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiResponse,
  ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SchedulingService } from './scheduling.service';
import {
  ScheduleEventDto,
  UpdateScheduledEventDto,
  CancelScheduledEventDto,
} from './dto/schedule-event.dto';
import { ScheduledEventStatus } from './schemas/scheduled-event.schema';

@ApiTags('Scheduling')
@Controller('projects/:projectId/scheduled-events')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT')
export class SchedulingController {
  constructor(private schedulingService: SchedulingService) {}

  @Post()
  @ApiOperation({ summary: 'Schedule a webhook for future delivery' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 201, description: 'Event scheduled' })
  @ApiResponse({ status: 400, description: 'Invalid schedule time or validation error' })
  schedule(
    @Param('projectId') projectId: string,
    @Body() dto: ScheduleEventDto,
    @Request() req: any,
  ) {
    return this.schedulingService.schedule(projectId, dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List scheduled events for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ScheduledEventStatus })
  @ApiResponse({ status: 200, description: 'Paginated list of scheduled events' })
  findAll(
    @Param('projectId') projectId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: ScheduledEventStatus,
  ) {
    return this.schedulingService.findAll(projectId, page, limit, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single scheduled event' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'id', description: 'Scheduled event ID' })
  @ApiResponse({ status: 200, description: 'Scheduled event details' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('id') id: string, @Param('projectId') projectId: string) {
    return this.schedulingService.findOne(id, projectId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a pending scheduled event (reschedule, change payload)' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'id', description: 'Scheduled event ID' })
  @ApiResponse({ status: 200, description: 'Updated scheduled event' })
  @ApiResponse({ status: 400, description: 'Cannot modify non-pending events' })
  update(
    @Param('id') id: string,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateScheduledEventDto,
  ) {
    return this.schedulingService.update(id, projectId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a pending scheduled event' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiParam({ name: 'id', description: 'Scheduled event ID' })
  @ApiResponse({ status: 200, description: 'Cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot cancel non-pending events' })
  cancel(
    @Param('id') id: string,
    @Param('projectId') projectId: string,
    @Body() dto: CancelScheduledEventDto,
  ) {
    return this.schedulingService.cancel(id, projectId, dto.reason);
  }
}
