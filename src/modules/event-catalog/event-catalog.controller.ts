import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { EventCatalogService } from './event-catalog.service';

@ApiTags('Event Catalog')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/event-types')
export class EventCatalogController {
  constructor(private svc: EventCatalogService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new event type in the catalog' })
  create(@Param('projectId') projectId: string, @Body() dto: any) {
    return this.svc.create(projectId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all event types in the catalog' })
  findAll(@Param('projectId') projectId: string, @Query('activeOnly') activeOnly = 'true') {
    return this.svc.findAll(projectId, activeOnly !== 'false');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event type details' })
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.svc.findOne(projectId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update event type (schema, sample payload, description)' })
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: any) {
    return this.svc.update(projectId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete event type from catalog' })
  delete(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.svc.delete(projectId, id);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate a payload against a named event type schema' })
  validate(
    @Param('projectId') projectId: string,
    @Body() dto: { eventType: string; payload: Record<string, any> },
  ) {
    return this.svc.validatePayload(projectId, dto.eventType, dto.payload);
  }

  // FEATURE 10: Webhook Contract Testing (CI/CD endpoint)
  @Post(':name/contract-test')
  @ApiOperation({
    summary:
      'CI/CD: validate payload shape against registered schema. Returns 200 on pass, 422 on fail.',
  })
  async contractTest(
    @Param('projectId') projectId: string,
    @Param('name') name: string,
    @Body() body: { payload: Record<string, any>; version?: string },
    @Res() res: Response,
  ) {
    const result = await this.svc.validatePayload(
      projectId,
      name,
      body.payload,
    );
    return res.status(result.valid ? 200 : 422).json(result);
  }

  // FEATURE 13: Webhook Simulator
  @Post(':id/simulate')
  @ApiOperation({
    summary: 'Fire a simulated webhook using the event type sample payload',
  })
  simulate(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: { overrides?: Record<string, any>; endpointId?: string },
  ) {
    return this.svc.simulate(projectId, id, dto.overrides);
  }
}
