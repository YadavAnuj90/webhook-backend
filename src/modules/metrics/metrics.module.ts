import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsExportService } from './metrics-export.service';

@Global()
@Module({
  providers: [MetricsService, MetricsExportService],
  controllers: [MetricsController],
  exports: [MetricsService, MetricsExportService],
})
export class MetricsModule {}
