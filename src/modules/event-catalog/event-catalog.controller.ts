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
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiQuery, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { EventCatalogService } from './event-catalog.service';
import { CreateEventTypeDto, ValidatePayloadDto, ContractTestDto, SimulateEventDto } from './dto/event-catalog.dto';

@ApiTags('Event Catalog')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/event-types')
export class EventCatalogController {
  constructor(private svc: EventCatalogService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new event type in the catalog with JSON Schema' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiBody({ schema: { required: ['name'], properties: { name: { type: 'string', example: 'payment.success', description: 'Event type in resource.verb format' }, description: { type: 'string' }, schema: { type: 'object', description: 'JSON Schema (Draft-07) for payload validation' }, samplePayload: { type: 'object' }, tags: { type: 'array', items: { type: 'string' } }, version: { type: 'string', example: '1.0.0' } } } })
  @ApiResponse({ status: 201, description: 'Event type registered in catalog' })
  @ApiResponse({ status: 400, description: 'Validation error or duplicate event type name' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Param('projectId') projectId: string, @Body() dto: CreateEventTypeDto) {
    return this.svc.create(projectId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all event types registered in the catalog' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean, description: 'Show only active event types (default: true)' })
  @ApiResponse({ status: 200, description: 'Array of event types with schema, sample payload, and metadata' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(@Param('projectId') projectId: string, @Query('activeOnly') activeOnly = 'true') {
    return this.svc.findAll(projectId, activeOnly !== 'false');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full details for an event type including JSON Schema' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Event type ID', type: String })
  @ApiResponse({ status: 200, description: 'Event type details' })
  @ApiResponse({ status: 404, description: 'Event type not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.svc.findOne(projectId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update event type schema, sample payload, description, or tags' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Event type ID', type: String })
  @ApiResponse({ status: 200, description: 'Updated event type' })
  @ApiResponse({ status: 404, description: 'Event type not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(@Param('projectId') projectId: string, @Param('id') id: string, @Body() dto: CreateEventTypeDto) {
    return this.svc.update(projectId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an event type from the catalog' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Event type ID', type: String })
  @ApiResponse({ status: 200, description: 'Event type deleted' })
  @ApiResponse({ status: 404, description: 'Event type not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  delete(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.svc.delete(projectId, id);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate a payload against a registered event type JSON Schema' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiBody({ schema: { required: ['eventType', 'payload'], properties: { eventType: { type: 'string', example: 'payment.success' }, payload: { type: 'object', description: 'Payload to validate against schema' } } } })
  @ApiResponse({ status: 200, description: '{ valid: boolean, errors: string[] }' })
  @ApiResponse({ status: 404, description: 'Event type not found in catalog' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  validate(
    @Param('projectId') projectId: string,
    @Body() dto: ValidatePayloadDto,
  ) {
    return this.svc.validatePayload(projectId, dto.eventType, dto.payload);
  }

  // CI/CD contract testing endpoint
  @Post(':name/contract-test')
  @ApiOperation({ summary: 'CI/CD: validate payload shape against registered schema — returns 200 on pass, 422 on failure' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'name', description: 'Event type name (e.g. payment.success)', type: String })
  @ApiBody({ schema: { required: ['payload'], properties: { payload: { type: 'object' }, version: { type: 'string', description: 'Schema version to test against (optional)' } } } })
  @ApiResponse({ status: 200, description: 'Payload passes schema validation' })
  @ApiResponse({ status: 422, description: 'Payload fails schema validation — errors array returned' })
  @ApiResponse({ status: 404, description: 'Event type not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async contractTest(
    @Param('projectId') projectId: string,
    @Param('name') name: string,
    @Body() dto: ContractTestDto,
    @Res() res: Response,
  ) {
    const result = await this.svc.validatePayload(
      projectId,
      name,
      dto.payload ?? {},
    );
    return res.status(result.valid ? 200 : 422).json(result);
  }

  // Webhook Simulator
  @Post(':id/simulate')
  @ApiOperation({ summary: 'Fire a simulated webhook using the event type sample payload' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: String })
  @ApiParam({ name: 'id', description: 'Event type ID', type: String })
  @ApiBody({ schema: { properties: { overrides: { type: 'object', description: 'Field overrides to merge into sample payload' }, endpointId: { type: 'string', description: 'Target endpoint (optional — uses all active endpoints if omitted)' } } } })
  @ApiResponse({ status: 201, description: 'Simulation queued — returns eventId(s)' })
  @ApiResponse({ status: 404, description: 'Event type not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  simulate(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: SimulateEventDto,
  ) {
    return this.svc.simulate(projectId, id, dto.overrides);
  }
}
