import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { EndpointsService } from './endpoints.service';
import { EndpointStatus } from './schemas/endpoint.schema';

@ApiTags('Endpoints')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/endpoints')
export class EndpointsController {
  constructor(private endpointsService: EndpointsService) {}

  @Post()
  @ApiOperation({ summary: 'Create endpoint' })
  create(@Param('projectId') projectId: string, @Body() dto: any) {
    return this.endpointsService.create(projectId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List endpoints' })
  findAll(@Param('projectId') projectId: string, @Query('page') page = 1, @Query('limit') limit = 20, @Query('status') status?: EndpointStatus) {
    return this.endpointsService.findAll(projectId, +page, +limit, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get endpoint' })
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.findOne(id, projectId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update endpoint' })
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: any) {
    return this.endpointsService.update(id, projectId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete endpoint' })
  delete(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.delete(id, projectId);
  }

  @Post(':id/rotate-secret')
  @ApiOperation({ summary: 'Rotate signing secret' })
  rotateSecret(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.rotateSecret(id, projectId);
  }

  @Patch(':id/pause')
  @ApiOperation({ summary: 'Pause endpoint' })
  pause(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.pause(id, projectId);
  }

  @Patch(':id/resume')
  @ApiOperation({ summary: 'Resume endpoint' })
  resume(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.endpointsService.resume(id, projectId);
  }
}
