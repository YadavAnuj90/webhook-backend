import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertRule, AlertRuleSchema } from './schemas/alert.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: AlertRule.name, schema: AlertRuleSchema }])],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
