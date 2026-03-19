import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { MetricsService } from './metrics.service';

@ApiTags('Metrics')
@ApiBearerAuth('JWT')
@Controller('metrics')
@UseGuards(AuthGuard('jwt'))
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Get Prometheus metrics (text/plain)' })
  async getMetrics(@Res() res: Response): Promise<void> {
    const body = await this.metricsService.getMetrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(body);
  }
}
