import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsBucket, AnalyticsBucketSchema } from './schemas/analytics-bucket.schema';
import { DeliveryLog, DeliveryLogSchema } from '../delivery/schemas/delivery-log.schema';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalyticsBucket.name, schema: AnalyticsBucketSchema },
      { name: DeliveryLog.name, schema: DeliveryLogSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
