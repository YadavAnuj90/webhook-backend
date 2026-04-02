import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Reflector } from '@nestjs/core';
import { AnalyticsBucket, AnalyticsBucketSchema } from './schemas/analytics-bucket.schema';
import { DeliveryLog, DeliveryLogSchema } from '../delivery/schemas/delivery-log.schema';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { CacheResponseInterceptor } from '../../common/interceptors/cache-response.interceptor';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AnalyticsBucket.name, schema: AnalyticsBucketSchema },
      { name: DeliveryLog.name, schema: DeliveryLogSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, CacheResponseInterceptor, Reflector],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
