import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Prometheus metrics scrape endpoint — returns text/plain in Prometheus exposition format' })
  @ApiResponse({ status: 200, description: 'Prometheus metrics text (Content-Type: text/plain; version=0.0.4)' })
  @ApiResponse({ status: 401, description: 'Unauthorized — use JWT or API key' })
  async getMetrics(@Res() res: Response): Promise<void> {
    const body = await this.metricsService.getMetrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(body);
  }
}
