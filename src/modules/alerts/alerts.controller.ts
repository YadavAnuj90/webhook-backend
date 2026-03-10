import { Controller, Get, Post, Put, Delete, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/strategies/jwt.strategy';

@ApiTags('Alerts')
@ApiBearerAuth('JWT')
@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private svc: AlertsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an alert rule' })
  create(@Request() req: any, @Body() dto: any) { return this.svc.create(req.user.id, dto); }

  @Get()
  @ApiOperation({ summary: 'List alert rules' })
  list(@Request() req: any) { return this.svc.list(req.user.id); }

  @Put(':id')
  @ApiOperation({ summary: 'Update alert rule' })
  update(@Param('id') id: string, @Request() req: any, @Body() dto: any) { return this.svc.update(req.user.id, id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete alert rule' })
  delete(@Param('id') id: string, @Request() req: any) { return this.svc.delete(req.user.id, id); }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Toggle alert rule active / inactive' })
  toggle(@Param('id') id: string, @Request() req: any) { return this.svc.toggle(req.user.id, id); }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send a test alert notification' })
  test(@Param('id') id: string, @Request() req: any) { return this.svc.test(req.user.id, id); }
}
