import { Controller, Post, Body, UseGuards, Request, Ip, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
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
  @ApiOperation({ summary: '[Legacy] Create Razorpay order for plan upgrade' })
  createOrder(@Request() req: any, @Body() body: { planId: string }, @Ip() ip: string) {
    return this.paymentsService.createOrder(req.user.id, body.planId, ip);
  }

  /** @deprecated Use POST /billing/subscription/upgrade/verify instead */
  @Post('verify')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: '[Legacy] Verify Razorpay payment' })
  verifyPayment(
    @Request() req: any,
    @Body() body: { orderId: string; paymentId: string; signature: string; planId: string },
    @Ip() ip: string,
  ) {
    return this.paymentsService.verifyPayment(req.user.id, body, ip);
  }

  /**
   * Razorpay server-side webhook — NO authentication (verified by HMAC signature).
   * Configure in Razorpay Dashboard → Settings → Webhooks → https://yourdomain.com/api/v1/billing/webhook
   */
  @Post('webhook')
  @ApiOperation({ summary: 'Razorpay webhook receiver (HMAC-verified, no JWT)' })
  webhook(
    @Body() body: any,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    return this.paymentsService.handleWebhook(body, signature);
  }
}
