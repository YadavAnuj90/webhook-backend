import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventType, EventTypeSchema } from './schemas/event-type.schema';
import { EventCatalogService } from './event-catalog.service';
import { EventCatalogController } from './event-catalog.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: EventType.name, schema: EventTypeSchema }])],
  controllers: [EventCatalogController],
  providers: [EventCatalogService],
  exports: [EventCatalogService, MongooseModule],
})
export class EventCatalogModule {}
