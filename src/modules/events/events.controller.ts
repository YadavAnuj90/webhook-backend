import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { EventsService } from './events.service';
import { EventStatus } from './schemas/event.schema';

@ApiTags('Events')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Post('send')
  @ApiOperation({ summary: 'Send webhook event' })
  send(@Param('projectId') projectId: string, @Body() dto: { endpointId: string; eventType: string; payload: any; idempotencyKey?: string }) {
    return this.eventsService.send(projectId, dto.endpointId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List events' })
  findAll(@Param('projectId') projectId: string, @Query('page') page = 1, @Query('limit') limit = 20, @Query('status') status?: EventStatus, @Query('endpointId') endpointId?: string) {
    return this.eventsService.findAll(projectId, +page, +limit, status, endpointId);
  }

  @Get('dlq')
  @ApiOperation({ summary: 'Get dead letter queue' })
  getDlq(@Param('projectId') projectId: string, @Query('page') page = 1, @Query('limit') limit = 20) {
    return this.eventsService.getDlq(projectId, +page, +limit);
  }

  @Post('dlq/replay-all')
  @ApiOperation({ summary: 'Replay all DLQ events' })
  replayDlq(@Param('projectId') projectId: string) {
    return this.eventsService.replayDlq(projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event details' })
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.eventsService.findOne(id, projectId);
  }

  @Post(':id/replay')
  @ApiOperation({ summary: 'Replay single event' })
  replay(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.eventsService.replay(id, projectId);
  }
}
