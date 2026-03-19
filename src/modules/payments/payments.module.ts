import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema }                     from '../users/schemas/user.schema';
import { Subscription, SubscriptionSchema }     from '../billing/schemas/subscription.schema';
import { PaymentsService }                      from './payments.service';
import { PaymentsController }                   from './payments.controller';
import { AuditModule }                          from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name,         schema: UserSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    AuditModule,
  ],
  controllers: [PaymentsController],
  providers:   [PaymentsService],
  exports:     [PaymentsService],
})
export class PaymentsModule {}
