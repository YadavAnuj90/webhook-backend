import { Controller, Post, Body, UseGuards, Request, Ip, Headers, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiBody, ApiHeader } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';

/**
 * Legacy payments controller — kept for backward compatibility.
 * New endpoints are in BillingController (/billing/subscription/*, /billing/credits/*, etc.)
 * This controller only retains the Razorpay webhook receiver and legacy order/verify routes.
 */
@ApiTags('Billing')
@Controller('billing')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  /** @deprecated Use POST /billing/subscription/upgrade/order instead */
  @Post('order')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: '[Legacy] Create Razorpay order for plan upgrade', deprecated: true })
  @ApiBody({ schema: { properties: { planId: { type: 'string', example: 'pro' } }, required: ['planId'] } })
  @ApiResponse({ status: 201, description: 'Razorpay order created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  createOrder(@Request() req: any, @Body() body: { planId: string }, @Ip() ip: string) {
    return this.paymentsService.createOrder(req.user.id, body.planId, ip);
  }

  /** @deprecated Use POST /billing/subscription/upgrade/verify instead */
  @Post('verify')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: '[Legacy] Verify Razorpay payment', deprecated: true })
  @ApiBody({ schema: { properties: { orderId: { type: 'string' }, paymentId: { type: 'string' }, signature: { type: 'string' }, planId: { type: 'string' } }, required: ['orderId', 'paymentId', 'signature', 'planId'] } })
  @ApiResponse({ status: 200, description: 'Payment verified and plan activated' })
  @ApiResponse({ status: 400, description: 'Invalid signature' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  verifyPayment(
    @Request() req: any,
    @Body() body: { orderId: string; paymentId: string; signature: string; planId: string },
    @Ip() ip: string,
  ) {
    return this.paymentsService.verifyPayment(req.user.id, body, ip);
  }

  /**
   * Razorpay server-side webhook — NO authentication (HMAC-SHA256 verified via x-razorpay-signature).
   * Configure in Razorpay Dashboard → Settings → Webhooks → https://yourdomain.com/api/v1/billing/webhook
   */
  @Post('webhook')
  @SkipThrottle()
  @HttpCode(200)
  @ApiOperation({ summary: 'Razorpay webhook receiver — HMAC-verified, no JWT auth required' })
  @ApiHeader({ name: 'x-razorpay-signature', description: 'HMAC-SHA256 of raw body using your Razorpay webhook secret', required: true })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  @ApiResponse({ status: 400, description: 'Invalid or missing HMAC signature' })
  webhook(
    @Body() body: any,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    return this.paymentsService.handleWebhook(body, signature);
  }
}
