import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Plan, PlanSchema }                             from './schemas/plan.schema';
import { Subscription, SubscriptionSchema }             from './schemas/subscription.schema';
import { Invoice, InvoiceSchema }                       from './schemas/invoice.schema';
import { CreditPackage, CreditPackageSchema,
         CreditBalance, CreditBalanceSchema,
         CreditTransaction, CreditTransactionSchema,
         SalesInquiry, SalesInquirySchema }              from './schemas/credit-ledger.schema';
import { Reseller, ResellerSchema,
         ResellerCustomer, ResellerCustomerSchema }     from './schemas/reseller.schema';

import { TrialService }        from './trial.service';
import { SubscriptionService } from './subscription.service';
import { CreditsService }      from './credits.service';
import { ResellerService }     from './reseller.service';
import { BillingEmailService } from './billing-email.service';
import { BillingController }   from './billing.controller';

import { User, UserSchema }         from '../users/schemas/user.schema';
import { AuditModule }              from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Plan.name,               schema: PlanSchema },
      { name: Subscription.name,       schema: SubscriptionSchema },
      { name: Invoice.name,            schema: InvoiceSchema },
      { name: CreditPackage.name,      schema: CreditPackageSchema },
      { name: CreditBalance.name,      schema: CreditBalanceSchema },
      { name: CreditTransaction.name,  schema: CreditTransactionSchema },
      { name: SalesInquiry.name,       schema: SalesInquirySchema },
      { name: Reseller.name,           schema: ResellerSchema },
      { name: ResellerCustomer.name,   schema: ResellerCustomerSchema },
      { name: User.name,               schema: UserSchema },
    ]),
    AuditModule,
  ],
  controllers: [BillingController],
  providers: [
    TrialService,
    SubscriptionService,
    CreditsService,
    ResellerService,
    BillingEmailService,
  ],
  exports: [
    TrialService,
    SubscriptionService,
    CreditsService,
    ResellerService,
    BillingEmailService,
    // Export Mongoose models so other modules can inject them if needed
    MongooseModule,
  ],
})
export class BillingModule {}
