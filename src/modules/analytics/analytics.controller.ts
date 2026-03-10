import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get analytics summary' })
  summary(@Param('projectId') projectId: string, @Query('days') days = 30, @Query('endpointId') endpointId?: string) {
    return this.analyticsService.getSummary(projectId, endpointId, +days);
  }

  @Get('time-series')
  @ApiOperation({ summary: 'Get time-series data' })
  timeSeries(@Param('projectId') projectId: string, @Query('from') from: string, @Query('to') to: string, @Query('granularity') granularity: 'hour' | 'day' = 'hour') {
    return this.analyticsService.getTimeSeries({ projectId, from: new Date(from || Date.now() - 7*24*3600_000), to: new Date(to || Date.now()), granularity });
  }

  @Get('event-types')
  @ApiOperation({ summary: 'Event type breakdown' })
  eventTypes(@Param('projectId') projectId: string, @Query('days') days = 7, @Query('endpointId') endpointId?: string) {
    return this.analyticsService.getEventTypeBreakdown(projectId, endpointId, +days);
  }
}
