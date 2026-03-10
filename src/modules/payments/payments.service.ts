import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as Razorpay from 'razorpay';
import { createHmac } from 'crypto';
import { User } from '../users/schemas/user.schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';

export const PLANS = {
  free:       { name: 'Free',       price: 0,      currency: 'INR', events: 1_000,     endpoints: 3,   retention: 7   },
  starter:    { name: 'Starter',    price: 2499,   currency: 'INR', events: 50_000,    endpoints: 20,  retention: 30  },
  pro:        { name: 'Pro',        price: 8299,   currency: 'INR', events: 500_000,   endpoints: 100, retention: 90  },
  enterprise: { name: 'Enterprise', price: 33299,  currency: 'INR', events: -1,        endpoints: -1,  retention: 365 },
};

@Injectable()
export class PaymentsService {
  private razorpay: any;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private config: ConfigService,
    private auditService: AuditService,
  ) {
    this.razorpay = new Razorpay({
      key_id: config.get('RAZORPAY_KEY_ID'),
      key_secret: config.get('RAZORPAY_KEY_SECRET'),
    });
  }

  getPlans() {
    return Object.entries(PLANS).map(([key, plan]) => ({ id: key, ...plan }));
  }

  async createOrder(userId: string, planId: string, ip: string) {
    const plan = PLANS[planId];
    if (!plan || plan.price === 0) throw new BadRequestException('Invalid plan or free plan selected');
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const order = await this.razorpay.orders.create({
      amount: plan.price * 100, // paise
      currency: 'INR',
      receipt: `order_${userId}_${planId}_${Date.now()}`,
      notes: { userId, planId, userEmail: user.email },
    });

    await this.auditService.log({ userId, action: AuditAction.BILLING_PAYMENT_ATTEMPT, metadata: { planId, orderId: order.id }, ipAddress: ip });
    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: this.config.get('RAZORPAY_KEY_ID'),
      prefill: { name: user.fullName || `${user.firstName} ${user.lastName}`, email: user.email },
    };
  }

  async verifyPayment(userId: string, dto: { orderId: string; paymentId: string; signature: string; planId: string }, ip: string) {
    const body = `${dto.orderId}|${dto.paymentId}`;
    const expectedSig = createHmac('sha256', this.config.get('RAZORPAY_KEY_SECRET'))
      .update(body).digest('hex');

    if (expectedSig !== dto.signature) throw new BadRequestException('Invalid payment signature');

    await this.userModel.findByIdAndUpdate(userId, {
      plan: dto.planId,
      razorpayOrderId: dto.orderId,
      razorpayPaymentId: dto.paymentId,
      subscriptionStartAt: new Date(),
      subscriptionEndAt: new Date(Date.now() + 30 * 24 * 3600_000),
    });

    await this.auditService.log({ userId, action: AuditAction.BILLING_PAYMENT_SUCCESS, metadata: { planId: dto.planId, paymentId: dto.paymentId }, ipAddress: ip });
    return { message: 'Payment verified. Plan upgraded.', plan: dto.planId };
  }

  async getSubscription(userId: string) {
    const user = await this.userModel.findById(userId, { plan: 1, subscriptionStartAt: 1, subscriptionEndAt: 1, razorpayPaymentId: 1 });
    if (!user) throw new NotFoundException('User not found');
    return {
      plan: user.plan || 'free',
      planDetails: PLANS[user.plan || 'free'],
      startAt: user.subscriptionStartAt,
      endAt: user.subscriptionEndAt,
      paymentId: user.razorpayPaymentId,
    };
  }

  async handleWebhook(body: any, signature: string) {
    const secret = this.config.get('RAZORPAY_WEBHOOK_SECRET');
    const digest = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    if (digest !== signature) throw new BadRequestException('Invalid webhook signature');

    const event = body.event;
    this.logger.log(`Razorpay webhook: ${event}`);

    if (event === 'payment.captured') {
      const payment = body.payload?.payment?.entity;
      if (payment?.notes?.userId && payment?.notes?.planId) {
        await this.userModel.findByIdAndUpdate(payment.notes.userId, {
          plan: payment.notes.planId,
          razorpayPaymentId: payment.id,
          subscriptionStartAt: new Date(),
          subscriptionEndAt: new Date(Date.now() + 30 * 24 * 3600_000),
        });
      }
    }

    if (event === 'payment.failed') {
      const payment = body.payload?.payment?.entity;
      if (payment?.notes?.userId) {
        await this.auditService.log({ userId: payment.notes.userId, action: AuditAction.BILLING_PAYMENT_FAILED, metadata: { paymentId: payment.id } });
      }
    }

    return { received: true };
  }
}
