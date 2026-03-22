import {
  Controller, Get, Post, Patch, Body, Param, Req, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth,
  ApiQuery, ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SubscriptionService } from './subscription.service';
import { TrialService } from './trial.service';
import { CreditsService } from './credits.service';
import { ResellerService } from './reseller.service';

@ApiTags('Billing')
@ApiBearerAuth('JWT')
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
  @ApiOperation({ summary: 'List all available subscription plans with pricing and limits' })
  @ApiResponse({ status: 200, description: 'Array of plan objects (free, starter, pro, enterprise)' })
  getPlans(): any[] {
    return this.subSvc.getSystemPlans();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SUBSCRIPTION (self-service portal)
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('subscription')
  @ApiOperation({ summary: 'Get current subscription and trial status' })
  @ApiResponse({ status: 200, description: 'Subscription details including plan, status, and expiry' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMySubscription(@Req() req: any): Promise<any> {
    return this.subSvc.getMySubscription(req.user.userId);
  }

  @Get('subscription/trial')
  @ApiOperation({ summary: 'Get trial countdown — days remaining, features, and upgrade prompt' })
  @ApiResponse({ status: 200, description: 'Trial status details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTrialStatus(@Req() req: any): Promise<any> {
    return this.trialSvc.getTrialStatus(req.user.userId);
  }

  @Post('subscription/upgrade/order')
  @ApiOperation({ summary: 'Create a Razorpay order to upgrade the subscription plan' })
  @ApiBody({ schema: { required: ['planId'], properties: { planId: { type: 'string', example: 'pro', enum: ['starter', 'pro', 'enterprise'] } } } })
  @ApiResponse({ status: 201, description: 'Razorpay order created — use orderId in /verify' })
  @ApiResponse({ status: 400, description: 'Invalid plan or already on this plan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createUpgradeOrder(@Req() req: any, @Body() body: { planId: string }): Promise<any> {
    return this.subSvc.createUpgradeOrder(req.user.userId, body.planId, req.ip);
  }

  @Post('subscription/upgrade/verify')
  @ApiOperation({ summary: 'Verify Razorpay payment and activate the new plan' })
  @ApiBody({ schema: { required: ['orderId', 'paymentId', 'signature', 'planId'], properties: { orderId: { type: 'string' }, paymentId: { type: 'string' }, signature: { type: 'string' }, planId: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Plan activated — subscription dates updated' })
  @ApiResponse({ status: 400, description: 'Invalid payment signature' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async verifyUpgrade(@Req() req: any, @Body() body: {
    orderId: string; paymentId: string; signature: string; planId: string;
  }): Promise<any> {
    return this.subSvc.verifyUpgradePayment(req.user.userId, body, req.ip);
  }

  @Post('subscription/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel current subscription (downgrade to free at period end)' })
  @ApiBody({ schema: { properties: { reason: { type: 'string', description: 'Optional cancellation reason' } } } })
  @ApiResponse({ status: 200, description: 'Subscription cancelled' })
  @ApiResponse({ status: 400, description: 'Already on free plan' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async cancelSubscription(@Req() req: any, @Body() body: { reason?: string }): Promise<any> {
    return this.subSvc.cancelSubscription(req.user.userId, body.reason);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  INVOICES
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('invoices')
  @ApiOperation({ summary: 'Get all payment invoices for the current user' })
  @ApiResponse({ status: 200, description: 'Array of invoice objects with amount, status, and download link' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getInvoices(@Req() req: any): Promise<any[]> {
    return this.subSvc.getInvoices(req.user.userId);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get a specific invoice by ID' })
  @ApiParam({ name: 'id', description: 'Invoice ID', type: String })
  @ApiResponse({ status: 200, description: 'Invoice details' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getInvoice(@Req() req: any, @Param('id') id: string): Promise<any> {
    return this.subSvc.getInvoiceById(req.user.userId, id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CREDITS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('credits/packages')
  @ApiOperation({ summary: 'List available credit packages for purchase' })
  @ApiResponse({ status: 200, description: 'Array of credit packages with price, credits, and bonus' })
  async getCreditPackages(): Promise<any[]> {
    return this.creditsSvc.getPackages();
  }

  @Get('credits/balance')
  @ApiOperation({ summary: 'Get current credit balance and auto-topup settings' })
  @ApiResponse({ status: 200, description: 'Balance object with credits, used, and auto-topup config' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCreditBalance(@Req() req: any): Promise<any> {
    return this.creditsSvc.getBalance(req.user.userId);
  }

  @Get('credits/transactions')
  @ApiOperation({ summary: 'Get credit transaction history (purchases and usage)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, description: 'Array of credit transactions in reverse chronological order' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCreditTransactions(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ): Promise<any[]> {
    return this.creditsSvc.getTransactions(req.user.userId, +(limit || 50), +(skip || 0));
  }

  @Post('credits/purchase/order')
  @ApiOperation({ summary: 'Create a Razorpay order to purchase a credit package' })
  @ApiBody({ schema: { required: ['packageId'], properties: { packageId: { type: 'string', description: 'Credit package ID from /billing/credits/packages' } } } })
  @ApiResponse({ status: 201, description: 'Razorpay order created — use orderId in /verify' })
  @ApiResponse({ status: 404, description: 'Package not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createCreditOrder(@Req() req: any, @Body() body: { packageId: string }): Promise<any> {
    return this.creditsSvc.createPurchaseOrder(req.user.userId, body.packageId, req.ip);
  }

  @Post('credits/purchase/verify')
  @ApiOperation({ summary: 'Verify Razorpay payment and credit the balance' })
  @ApiBody({ schema: { required: ['orderId', 'paymentId', 'signature', 'packageId'], properties: { orderId: { type: 'string' }, paymentId: { type: 'string' }, signature: { type: 'string' }, packageId: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Payment verified and credits added to balance' })
  @ApiResponse({ status: 400, description: 'Invalid payment signature' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async verifyCreditPurchase(@Req() req: any, @Body() body: {
    orderId: string; paymentId: string; signature: string; packageId: string;
  }): Promise<any> {
    return this.creditsSvc.verifyPurchase(req.user.userId, body, req.ip);
  }

  @Patch('credits/auto-topup')
  @ApiOperation({ summary: 'Configure automatic credit top-up when balance falls below threshold' })
  @ApiBody({ schema: { required: ['enabled'], properties: { enabled: { type: 'boolean' }, packageId: { type: 'string', description: 'Package to auto-purchase when below threshold' }, threshold: { type: 'number', description: 'Credits remaining that triggers auto top-up' } } } })
  @ApiResponse({ status: 200, description: 'Auto top-up settings updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
  @ApiResponse({ status: 200, description: 'Reseller profile with branding and pricing settings' })
  @ApiResponse({ status: 403, description: 'Enterprise plan required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getResellerProfile(@Req() req: any): Promise<any> {
    return this.resellerSvc.getProfile(req.user.userId);
  }

  @Post('reseller/profile')
  @ApiOperation({ summary: 'Create or update reseller profile' })
  @ApiBody({ schema: { required: ['companyName'], properties: { companyName: { type: 'string' }, logoUrl: { type: 'string' }, supportEmail: { type: 'string' }, webhookPortalDomain: { type: 'string' }, defaultMarkupPct: { type: 'number', example: 20 }, pricePerThousandEvents: { type: 'number', example: 0.5 } } } })
  @ApiResponse({ status: 200, description: 'Reseller profile created/updated' })
  @ApiResponse({ status: 403, description: 'Enterprise plan required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async upsertResellerProfile(@Req() req: any, @Body() body: {
    companyName: string; logoUrl?: string; supportEmail?: string;
    webhookPortalDomain?: string; defaultMarkupPct?: number;
    pricePerThousandEvents?: number;
  }): Promise<any> {
    return this.resellerSvc.upsertProfile(req.user.userId, body);
  }

  @Get('reseller/customers')
  @ApiOperation({ summary: 'List all reseller sub-customers' })
  @ApiResponse({ status: 200, description: 'Array of customer accounts with plan and usage info' })
  @ApiResponse({ status: 403, description: 'Enterprise plan required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listCustomers(@Req() req: any): Promise<any[]> {
    return this.resellerSvc.listCustomers(req.user.userId);
  }

  @Post('reseller/customers')
  @ApiOperation({ summary: 'Add a customer to the reseller account' })
  @ApiBody({ schema: { required: ['customerEmail'], properties: { customerEmail: { type: 'string' }, planId: { type: 'string' }, markupPct: { type: 'number' }, pricePerThousandEvents: { type: 'number' }, notes: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'Customer added to reseller account' })
  @ApiResponse({ status: 404, description: 'Customer email not found in system' })
  @ApiResponse({ status: 403, description: 'Enterprise plan required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async addCustomer(@Req() req: any, @Body() body: {
    customerEmail: string; planId?: string; markupPct?: number;
    pricePerThousandEvents?: number; notes?: string;
  }): Promise<any> {
    return this.resellerSvc.addCustomer(req.user.userId, body);
  }

  @Post('reseller/customers/:customerId/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend a reseller customer account' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: String })
  @ApiResponse({ status: 200, description: 'Customer suspended' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async suspendCustomer(@Req() req: any, @Param('customerId') customerId: string): Promise<any> {
    return this.resellerSvc.suspendCustomer(req.user.userId, customerId);
  }

  @Post('reseller/customers/:customerId/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a suspended reseller customer account' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: String })
  @ApiResponse({ status: 200, description: 'Customer reactivated' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async reactivateCustomer(@Req() req: any, @Param('customerId') customerId: string): Promise<any> {
    return this.resellerSvc.reactivateCustomer(req.user.userId, customerId);
  }

  @Get('reseller/customers/:customerId/invoices')
  @ApiOperation({ summary: 'Get invoice history for a specific reseller customer' })
  @ApiParam({ name: 'customerId', description: 'Customer ID', type: String })
  @ApiResponse({ status: 200, description: 'Array of invoices for the customer' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCustomerInvoices(@Req() req: any, @Param('customerId') customerId: string): Promise<any[]> {
    return this.resellerSvc.getCustomerInvoices(req.user.userId, customerId);
  }

  @Post('reseller/invoices/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger monthly invoice generation for all reseller customers' })
  @ApiResponse({ status: 200, description: 'Invoices generated — returns count and total revenue' })
  @ApiResponse({ status: 403, description: 'Enterprise plan required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async generateInvoices(@Req() req: any): Promise<any> {
    return this.resellerSvc.generateMonthlyInvoices(req.user.userId);
  }

  @Get('reseller/revenue')
  @ApiOperation({ summary: 'Get reseller revenue summary (MRR, total, by customer)' })
  @ApiResponse({ status: 200, description: 'Revenue breakdown with MRR, YTD totals, and per-customer data' })
  @ApiResponse({ status: 403, description: 'Enterprise plan required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getRevenue(@Req() req: any): Promise<any> {
    return this.resellerSvc.getResellerRevenue(req.user.userId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CUSTOM PLANS (Reseller creates plans for customers)
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('reseller/plans')
  @ApiOperation({ summary: 'List custom plans created by the reseller for their customers' })
  @ApiResponse({ status: 200, description: 'Array of custom plan objects' })
  @ApiResponse({ status: 403, description: 'Enterprise plan required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCustomPlans(@Req() req: any): Promise<any[]> {
    return this.subSvc.getCustomPlans(req.user.userId);
  }

  @Post('reseller/plans')
  @ApiOperation({ summary: 'Create a custom subscription plan for reseller customers' })
  @ApiBody({ schema: { required: ['name', 'priceMonthly', 'eventsPerMonth', 'endpointsLimit', 'retentionDays'], properties: { name: { type: 'string', example: 'Startup Plan' }, description: { type: 'string' }, priceMonthly: { type: 'number', example: 29.99 }, eventsPerMonth: { type: 'number', example: 500000 }, endpointsLimit: { type: 'number', example: 20 }, retentionDays: { type: 'number', example: 60 } } } })
  @ApiResponse({ status: 201, description: 'Custom plan created' })
  @ApiResponse({ status: 403, description: 'Enterprise plan required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createCustomPlan(@Req() req: any, @Body() body: {
    name: string; description?: string;
    priceMonthly: number; eventsPerMonth: number;
    endpointsLimit: number; retentionDays: number;
  }): Promise<any> {
    return this.subSvc.createCustomPlan(req.user.userId, body);
  }
}
