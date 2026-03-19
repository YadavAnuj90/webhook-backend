import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsExportService } from './metrics-export.service';

@Module({
  providers: [MetricsService, MetricsExportService],
  controllers: [MetricsController],
  exports: [MetricsService, MetricsExportService],
})
export class MetricsModule {}
