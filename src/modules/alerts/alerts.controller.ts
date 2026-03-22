import { Controller, Get, Post, Put, Delete, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/strategies/jwt.strategy';

@ApiTags('Alerts')
@ApiBearerAuth('JWT')
@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private svc: AlertsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an alert rule (failure rate or latency threshold)' })
  @ApiBody({ schema: { required: ['name', 'type', 'threshold'], properties: { name: { type: 'string', example: 'High failure rate' }, type: { type: 'string', enum: ['failure_rate', 'latency'], description: 'Type of metric to monitor' }, threshold: { type: 'number', description: 'Threshold value to trigger the alert (e.g. 0.1 = 10% failure rate)' }, endpointId: { type: 'string', description: 'Scope to a specific endpoint (optional)' }, notifyEmail: { type: 'string', format: 'email' }, notifySlack: { type: 'string', description: 'Slack webhook URL' } } } })
  @ApiResponse({ status: 201, description: 'Alert rule created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Request() req: any, @Body() dto: any) { return this.svc.create(req.user.id, dto); }

  @Get()
  @ApiOperation({ summary: 'List all alert rules for the current user' })
  @ApiResponse({ status: 200, description: 'Array of alert rules with current status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  list(@Request() req: any) { return this.svc.list(req.user.id); }

  @Put(':id')
  @ApiOperation({ summary: 'Update an alert rule (threshold, notification channels, name)' })
  @ApiParam({ name: 'id', description: 'Alert rule ID', type: String })
  @ApiResponse({ status: 200, description: 'Updated alert rule' })
  @ApiResponse({ status: 404, description: 'Alert rule not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(@Param('id') id: string, @Request() req: any, @Body() dto: any) { return this.svc.update(req.user.id, id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an alert rule permanently' })
  @ApiParam({ name: 'id', description: 'Alert rule ID', type: String })
  @ApiResponse({ status: 200, description: 'Alert rule deleted' })
  @ApiResponse({ status: 404, description: 'Alert rule not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  delete(@Param('id') id: string, @Request() req: any) { return this.svc.delete(req.user.id, id); }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Toggle an alert rule active / inactive' })
  @ApiParam({ name: 'id', description: 'Alert rule ID', type: String })
  @ApiResponse({ status: 200, description: 'Alert rule toggled — returns new isActive state' })
  @ApiResponse({ status: 404, description: 'Alert rule not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  toggle(@Param('id') id: string, @Request() req: any) { return this.svc.toggle(req.user.id, id); }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send a test alert notification to verify channels are working' })
  @ApiParam({ name: 'id', description: 'Alert rule ID', type: String })
  @ApiResponse({ status: 200, description: 'Test notification sent to all configured channels' })
  @ApiResponse({ status: 404, description: 'Alert rule not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  test(@Param('id') id: string, @Request() req: any) { return this.svc.test(req.user.id, id); }
}
