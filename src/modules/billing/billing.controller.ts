import {
  Controller, Get, Post, Patch, Body, Param, Req, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SubscriptionService } from './subscription.service';
import { TrialService } from './trial.service';
import { CreditsService } from './credits.service';
import { ResellerService } from './reseller.service';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('billing')
export class BillingController {
  constructor(
    private readonly subSvc:      SubscriptionService,
    private readonly trialSvc:    TrialService,
    private readonly creditsSvc:  CreditsService,
    private readonly resellerSvc: ResellerService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  //  PLANS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('plans')
  @ApiOperation({ summary: 'List all available subscription plans' })
  getPlans(): any[] {
    return this.subSvc.getSystemPlans();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SUBSCRIPTION (self-service portal)
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('subscription')
  @ApiOperation({ summary: 'Get my current subscription & trial status' })
  async getMySubscription(@Req() req: any): Promise<any> {
    return this.subSvc.getMySubscription(req.user.userId);
  }

  @Get('subscription/trial')
  @ApiOperation({ summary: 'Get trial countdown details' })
  async getTrialStatus(@Req() req: any): Promise<any> {
    return this.trialSvc.getTrialStatus(req.user.userId);
  }

  @Post('subscription/upgrade/order')
  @ApiOperation({ summary: 'Create Razorpay order to upgrade plan' })
  async createUpgradeOrder(@Req() req: any, @Body() body: { planId: string }): Promise<any> {
    return this.subSvc.createUpgradeOrder(req.user.userId, body.planId, req.ip);
  }

  @Post('subscription/upgrade/verify')
  @ApiOperation({ summary: 'Verify payment & activate new plan' })
  async verifyUpgrade(@Req() req: any, @Body() body: {
    orderId: string; paymentId: string; signature: string; planId: string;
  }): Promise<any> {
    return this.subSvc.verifyUpgradePayment(req.user.userId, body, req.ip);
  }

  @Post('subscription/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel current subscription' })
  async cancelSubscription(@Req() req: any, @Body() body: { reason?: string }): Promise<any> {
    return this.subSvc.cancelSubscription(req.user.userId, body.reason);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INVOICES
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('invoices')
  @ApiOperation({ summary: 'Get all my invoices' })
  async getInvoices(@Req() req: any): Promise<any[]> {
    return this.subSvc.getInvoices(req.user.userId);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get a specific invoice' })
  async getInvoice(@Req() req: any, @Param('id') id: string): Promise<any> {
    return this.subSvc.getInvoiceById(req.user.userId, id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CREDITS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('credits/packages')
  @ApiOperation({ summary: 'List available credit packages for purchase' })
  async getCreditPackages(): Promise<any[]> {
    return this.creditsSvc.getPackages();
  }

  @Get('credits/balance')
  @ApiOperation({ summary: 'Get my current credit balance' })
  async getCreditBalance(@Req() req: any): Promise<any> {
    return this.creditsSvc.getBalance(req.user.userId);
  }

  @Get('credits/transactions')
  @ApiOperation({ summary: 'Get credit transaction history' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'skip', required: false })
  async getCreditTransactions(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ): Promise<any[]> {
    return this.creditsSvc.getTransactions(req.user.userId, +(limit || 50), +(skip || 0));
  }

  @Post('credits/purchase/order')
  @ApiOperation({ summary: 'Create Razorpay order to buy credit package' })
  async createCreditOrder(@Req() req: any, @Body() body: { packageId: string }): Promise<any> {
    return this.creditsSvc.createPurchaseOrder(req.user.userId, body.packageId, req.ip);
  }

  @Post('credits/purchase/verify')
  @ApiOperation({ summary: 'Verify credit purchase payment & credit balance' })
  async verifyCreditPurchase(@Req() req: any, @Body() body: {
    orderId: string; paymentId: string; signature: string; packageId: string;
  }): Promise<any> {
    return this.creditsSvc.verifyPurchase(req.user.userId, body, req.ip);
  }

  @Patch('credits/auto-topup')
  @ApiOperation({ summary: 'Configure auto top-up settings' })
  async updateAutoTopUp(@Req() req: any, @Body() body: {
    enabled: boolean; packageId?: string; threshold?: number;
  }): Promise<any> {
    return this.creditsSvc.updateAutoTopUp(req.user.userId, body);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RESELLER PORTAL
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('reseller/profile')
  @ApiOperation({ summary: 'Get reseller profile (Enterprise plan required)' })
  async getResellerProfile(@Req() req: any): Promise<any> {
    return this.resellerSvc.getProfile(req.user.userId);
  }

  @Post('reseller/profile')
  @ApiOperation({ summary: 'Create/update reseller profile' })
  async upsertResellerProfile(@Req() req: any, @Body() body: {
    companyName: string; logoUrl?: string; supportEmail?: string;
    webhookPortalDomain?: string; defaultMarkupPct?: number;
    pricePerThousandEvents?: number;
  }): Promise<any> {
    return this.resellerSvc.upsertProfile(req.user.userId, body);
  }

  @Get('reseller/customers')
  @ApiOperation({ summary: 'List all reseller customers' })
  async listCustomers(@Req() req: any): Promise<any[]> {
    return this.resellerSvc.listCustomers(req.user.userId);
  }

  @Post('reseller/customers')
  @ApiOperation({ summary: 'Add a customer to reseller account' })
  async addCustomer(@Req() req: any, @Body() body: {
    customerEmail: string; planId?: string; markupPct?: number;
    pricePerThousandEvents?: number; notes?: string;
  }): Promise<any> {
    return this.resellerSvc.addCustomer(req.user.userId, body);
  }

  @Post('reseller/customers/:customerId/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend a reseller customer' })
  async suspendCustomer(@Req() req: any, @Param('customerId') customerId: string): Promise<any> {
    return this.resellerSvc.suspendCustomer(req.user.userId, customerId);
  }

  @Post('reseller/customers/:customerId/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a suspended reseller customer' })
  async reactivateCustomer(@Req() req: any, @Param('customerId') customerId: string): Promise<any> {
    return this.resellerSvc.reactivateCustomer(req.user.userId, customerId);
  }

  @Get('reseller/customers/:customerId/invoices')
  @ApiOperation({ summary: 'Get invoices for a specific customer' })
  async getCustomerInvoices(@Req() req: any, @Param('customerId') customerId: string): Promise<any[]> {
    return this.resellerSvc.getCustomerInvoices(req.user.userId, customerId);
  }

  @Post('reseller/invoices/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger monthly invoice generation for all customers' })
  async generateInvoices(@Req() req: any): Promise<any> {
    return this.resellerSvc.generateMonthlyInvoices(req.user.userId);
  }

  @Get('reseller/revenue')
  @ApiOperation({ summary: 'Get reseller revenue summary' })
  async getRevenue(@Req() req: any): Promise<any> {
    return this.resellerSvc.getResellerRevenue(req.user.userId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CUSTOM PLANS (Reseller creates plans for customers)
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('reseller/plans')
  @ApiOperation({ summary: 'List custom plans created by reseller' })
  async getCustomPlans(@Req() req: any): Promise<any[]> {
    return this.subSvc.getCustomPlans(req.user.userId);
  }

  @Post('reseller/plans')
  @ApiOperation({ summary: 'Create a custom plan for reseller customers' })
  async createCustomPlan(@Req() req: any, @Body() body: {
    name: string; description?: string;
    priceMonthly: number; eventsPerMonth: number;
    endpointsLimit: number; retentionDays: number;
  }): Promise<any> {
    return this.subSvc.createCustomPlan(req.user.userId, body);
  }
}
