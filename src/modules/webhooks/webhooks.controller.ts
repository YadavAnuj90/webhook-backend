import {
  Controller, Post, Get, Param, Body, Query,
  UseGuards, Request, ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import { Model } from 'mongoose';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryService } from '../delivery/delivery.service';
import { ProjectsService } from '../projects/projects.service';
import { WebhookEvent, EventStatus } from '../events/schemas/event.schema';
import { Endpoint, EndpointStatus } from '../endpoints/schemas/endpoint.schema';
import { WEBHOOK_QUEUE } from '../../queue/queue.constants';

class SendWebhookDto {
  @ApiProperty({ example: 'payment.success' }) @IsString() eventType: string;
  @ApiProperty({ example: { orderId: '123', amount: 99.99 } }) @IsObject() payload: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsString() idempotencyKey?: string;
}

@ApiTags('Webhooks')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/webhooks')
export class WebhooksController {
  constructor(
    @InjectModel(WebhookEvent.name) private eventModel: Model<WebhookEvent>,
    @InjectModel(Endpoint.name) private endpointModel: Model<Endpoint>,
    @InjectQueue(WEBHOOK_QUEUE) private webhookQueue: Queue,
    private deliveryService: DeliveryService,
    private projectsService: ProjectsService,
  ) {}

  @Post('endpoints/:endpointId/send')
  @ApiOperation({ summary: 'Send event to a specific endpoint' })
  async send(
    @Param('projectId') projectId: string,
    @Param('endpointId') endpointId: string,
    @Body() dto: SendWebhookDto,
    @Request() req: any,
  ) {
    const withinLimit = await this.projectsService.checkEventLimit(projectId);
    if (!withinLimit) return { error: 'Monthly event limit reached' };

    const endpoint = await this.endpointModel.findOne({ _id: endpointId, projectId });
    if (!endpoint || endpoint.status !== EndpointStatus.ACTIVE) {
      return { error: 'Endpoint not active' };
    }

    const idempotencyKey = dto.idempotencyKey || uuidv4();
    const existing = await this.eventModel.findOne({ idempotencyKey, endpointId });
    if (existing) throw new ConflictException(`Duplicate idempotency key: ${idempotencyKey}`);

    const event = await this.eventModel.create({
      projectId, endpointId, eventType: dto.eventType,
      payload: dto.payload, idempotencyKey, status: EventStatus.PENDING,
    });

    await this.webhookQueue.add({ eventId: event.id }, { attempts: 1 });
    await this.projectsService.incrementEventCount(projectId);
    return { message: 'Queued', eventId: event.id, idempotencyKey };
  }

  @Post('broadcast')
  @ApiOperation({ summary: 'Broadcast event to ALL active endpoints in project' })
  async broadcast(
    @Param('projectId') projectId: string,
    @Body() dto: SendWebhookDto,
  ) {
    const endpoints = await this.endpointModel.find({ projectId, status: EndpointStatus.ACTIVE });
    const results = await Promise.all(endpoints.map(async ep => {
      const idempotencyKey = dto.idempotencyKey ? `${dto.idempotencyKey}-${ep.id}` : uuidv4();
      const event = await this.eventModel.create({
        projectId, endpointId: ep.id, eventType: dto.eventType,
        payload: dto.payload, idempotencyKey, status: EventStatus.PENDING,
      });
      await this.webhookQueue.add({ eventId: event.id }, { attempts: 1 });
      return { endpointId: ep.id, eventId: event.id };
    }));
    return { dispatched: results.length, results };
  }

  @Get('events')
  @ApiOperation({ summary: 'List events with filters + pagination' })
  async getEvents(
    @Param('projectId') projectId: string,
    @Query('endpointId') endpointId?: string,
    @Query('status') status?: string,
    @Query('eventType') eventType?: string,
    @Query('limit') limit = 20,
    @Query('page') page = 1,
  ) {
    const filter: any = { projectId };
    if (endpointId) filter.endpointId = endpointId;
    if (status) filter.status = status;
    if (eventType) filter.eventType = new RegExp(eventType, 'i');

    const skip = (Number(page) - 1) * Number(limit);
    const [events, total] = await Promise.all([
      this.eventModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      this.eventModel.countDocuments(filter),
    ]);
    return { events, total, page: Number(page), limit: Number(limit) };
  }

  @Post('events/:eventId/replay')
  @ApiOperation({ summary: 'Replay a failed or dead event' })
  async replay(@Param('eventId') eventId: string) {
    await this.deliveryService.replay(eventId);
    return { message: 'Queued for replay', eventId };
  }

  @Get('events/:eventId/logs')
  @ApiOperation({ summary: 'Get delivery logs for an event' })
  getLogs(@Param('eventId') eventId: string) {
    return this.deliveryService.getDeliveryLogs(eventId);
  }

  @Get('dlq')
  @ApiOperation({ summary: 'Get Dead Letter Queue events' })
  getDlq(@Param('projectId') projectId: string) {
    return this.deliveryService.getDlqEvents(projectId);
  }
}
