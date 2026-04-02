import { Controller, Get, Query, Param, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AnalyticsService } from './analytics.service';
import { CacheResponseInterceptor, CacheTtl } from '../../common/interceptors/cache-response.interceptor';

@ApiTags('Analytics')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(CacheResponseInterceptor)
@Controller('projects/:projectId/analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('summary')
  @CacheTtl(30)
  @ApiOperation({ summary: 'Get analytics summary: totals, success rate, avg latency for a time window' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiQuery({ name: 'days', required: false, type: Number, example: 30, description: 'Look-back window in days (default 30)' })
  @ApiQuery({ name: 'endpointId', required: false, type: String, description: 'Scope to a single endpoint' })
  @ApiResponse({ status: 200, description: 'Analytics summary object with delivery stats and trends' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  summary(@Param('projectId') projectId: string, @Query('days') days = 30, @Query('endpointId') endpointId?: string) {
    return this.analyticsService.getSummary(projectId, endpointId, +days);
  }

  @Get('time-series')
  @ApiOperation({ summary: 'Get time-series delivery data for charting (hourly or daily granularity)' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO date start (default: 7 days ago)', example: '2024-01-01T00:00:00Z' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO date end (default: now)', example: '2024-01-07T23:59:59Z' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['hour', 'day'], description: 'Data point granularity (default: hour)' })
  @ApiResponse({ status: 200, description: 'Array of time-series data points with delivered/failed/pending counts' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  timeSeries(@Param('projectId') projectId: string, @Query('from') from: string, @Query('to') to: string, @Query('granularity') granularity: 'hour' | 'day' = 'hour') {
    return this.analyticsService.getTimeSeries({ projectId, from: new Date(from || Date.now() - 7*24*3600_000), to: new Date(to || Date.now()), granularity });
  }

  @Get('event-types')
  @ApiOperation({ summary: 'Get event type breakdown — delivery counts per event type for a time window' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiQuery({ name: 'days', required: false, type: Number, example: 7 })
  @ApiQuery({ name: 'endpointId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Array of event types with delivery count and success rate' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  eventTypes(
    @Param('projectId') projectId: string,
    @Query('days') days = 7,
    @Query('endpointId') endpointId?: string,
  ) {
    return this.analyticsService.getEventTypeBreakdown(
      projectId,
      endpointId,
      +days,
    );
  }

  @Get('heatmap')
  @ApiOperation({ summary: 'Delivery heatmap — 7×24 matrix of delivery counts by [dayOfWeek][hour]' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiResponse({ status: 200, description: '7×24 matrix showing delivery volume by day-of-week and hour' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getHeatmap(@Param('projectId') projectId: string) {
    return this.analyticsService.getHeatmap(projectId);
  }
}
