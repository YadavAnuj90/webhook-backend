import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { OperationalWebhooksService } from './operational-webhooks.service';

@ApiTags('Operational Webhooks')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/operational-webhooks')
export class OperationalWebhooksController {
  constructor(private svc: OperationalWebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Register an operational/system webhook URL' })
  create(@Param('projectId') p: string, @Body() dto: any) { return this.svc.create(p, dto); }

  @Get()
  @ApiOperation({ summary: 'List operational webhooks for a project' })
  list(@Param('projectId') p: string) { return this.svc.list(p); }

  @Put(':id')
  @ApiOperation({ summary: 'Update operational webhook config' })
  update(@Param('projectId') p: string, @Param('id') id: string, @Body() dto: any) { return this.svc.update(p, id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete operational webhook' })
  delete(@Param('projectId') p: string, @Param('id') id: string) { return this.svc.delete(p, id); }

  @Post(':id/rotate-secret')
  @ApiOperation({ summary: 'Rotate operational webhook secret' })
  rotate(@Param('projectId') p: string, @Param('id') id: string) { return this.svc.rotateSecret(p, id); }

  @Post(':id/test')
  @ApiOperation({ summary: 'Send a test operational event' })
  test(@Param('projectId') p: string, @Param('id') id: string) { return this.svc.test(p, id); }
}
