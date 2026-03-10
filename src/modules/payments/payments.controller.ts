import { Controller, Get, Post, Body, UseGuards, Request, Ip, Headers, RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PaymentsService } from './payments.service';

@ApiTags('Billing')
@Controller('billing')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get available plans' })
  getPlans() { return this.paymentsService.getPlans(); }

  @Post('order')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create Razorpay order' })
  createOrder(@Request() req: any, @Body() body: { planId: string }, @Ip() ip: string) {
    return this.paymentsService.createOrder(req.user.id, body.planId, ip);
  }

  @Post('verify')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Verify Razorpay payment' })
  verifyPayment(@Request() req: any, @Body() body: { orderId: string; paymentId: string; signature: string; planId: string }, @Ip() ip: string) {
    return this.paymentsService.verifyPayment(req.user.id, body, ip);
  }

  @Get('subscription')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get current subscription' })
  getSubscription(@Request() req: any) {
    return this.paymentsService.getSubscription(req.user.id);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Razorpay webhook handler' })
  webhook(@Body() body: any, @Headers('x-razorpay-signature') signature: string) {
    return this.paymentsService.handleWebhook(body, signature);
  }
}
