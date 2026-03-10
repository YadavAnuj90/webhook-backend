import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Endpoint, EndpointSchema } from './schemas/endpoint.schema';
import { EndpointsService } from './endpoints.service';
import { EndpointsController } from './endpoints.controller';
import { EndpointRateLimiterService } from './endpoint-rate-limiter.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Endpoint.name, schema: EndpointSchema }])],
  controllers: [EndpointsController],
  providers: [EndpointsService, EndpointRateLimiterService],
  exports: [MongooseModule, EndpointRateLimiterService, EndpointsService],
})
export class EndpointsModule {}
