import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Subscription, SubscriptionStatus } from './schemas/subscription.schema';
import { User } from '../users/schemas/user.schema';
import { BillingEmailService } from './billing-email.service';

export const TRIAL_DAYS = 10;

@Injectable()
export class TrialService {
  private readonly logger = new Logger(TrialService.name);

  constructor(
    @InjectModel(Subscription.name) private subModel:  Model<Subscription>,
    @InjectModel(User.name)         private userModel: Model<User>,
    private emailSvc: BillingEmailService,
  ) {}

  async startTrial(userId: string): Promise<Subscription> {
    const now      = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 3600_000);
    const existing = await this.subModel.findOne({ userId });
    if (existing) return existing;
    return this.subModel.create({
      userId, planId: 'trial', planName: 'Free Trial',
      status: SubscriptionStatus.TRIAL,
      trialStartAt: now, trialEndAt: trialEnd,
      currentPeriodStart: now, currentPeriodEnd: trialEnd,
      eventsPerMonth: 5_000, endpointsLimit: 5, retentionDays: 7,
    });
  }

  async getSubscription(userId: string): Promise<Subscription | null> {
    return this.subModel.findOne({ userId });
  }

  async isAllowed(userId: string): Promise<{ allowed: boolean; reason?: string; daysLeft?: number }> {
    const sub = await this.subModel.findOne({ userId });
    if (!sub) return { allowed: true };
    const now = new Date();

    switch (sub.status) {
      case SubscriptionStatus.TRIAL: {
        if (sub.trialEndAt && now > sub.trialEndAt) {
          await this.subModel.findByIdAndUpdate(sub._id, { status: SubscriptionStatus.TRIAL_EXPIRED });
          return { allowed: false, reason: 'trial_expired' };
        }
        const daysLeft = Math.max(0, Math.ceil((sub.trialEndAt!.getTime() - now.getTime()) / 86_400_000));
        return { allowed: true, daysLeft };
      }
      case SubscriptionStatus.ACTIVE:
        if (sub.currentPeriodEnd && now > sub.currentPeriodEnd) {
          await this.subModel.findByIdAndUpdate(sub._id, { status: SubscriptionStatus.PAST_DUE });
          return { allowed: false, reason: 'subscription_expired' };
        }
        return { allowed: true };
      case SubscriptionStatus.CREDIT_ONLY:
        return { allowed: true };
      case SubscriptionStatus.TRIAL_EXPIRED:
        return { allowed: false, reason: 'trial_expired' };
      case SubscriptionStatus.PAST_DUE:
        return { allowed: false, reason: 'payment_past_due' };
      case SubscriptionStatus.SUSPENDED:
        return { allowed: false, reason: 'account_suspended' };
      case SubscriptionStatus.CANCELLED:
        return { allowed: false, reason: 'subscription_cancelled' };
      default:
        return { allowed: false, reason: 'unknown_status' };
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleSubscriptions() {
    const now = new Date();

    const expiredTrials = await this.subModel.updateMany(
      { status: SubscriptionStatus.TRIAL, trialEndAt: { $lt: now } },
      { $set: { status: SubscriptionStatus.TRIAL_EXPIRED } },
    );

    const expiredSubs = await this.subModel.updateMany(
      { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: { $lt: now } },
      { $set: { status: SubscriptionStatus.PAST_DUE } },
    );

    if (expiredTrials.modifiedCount > 0) {
      const justExpired = await this.subModel.find({
        status: SubscriptionStatus.TRIAL_EXPIRED,
        trialEndAt: { $gt: new Date(now.getTime() - 3600_000), $lt: now },
      });
      for (const sub of justExpired) {
        const user = await this.userModel.findById(sub.userId);
        if (user) {
          await this.emailSvc.sendTrialExpired((user as any).email, (user as any).firstName || 'there');
        }
      }
    }

    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 3600_000);
    const oneDayBuffer     = new Date(now.getTime() + 25 * 3600_000);
    const soonExpiring = await this.subModel.find({
      status: SubscriptionStatus.TRIAL,
      trialEndAt: { $gte: oneDayBuffer, $lte: threeDaysFromNow },
    });
    for (const sub of soonExpiring) {
      const daysLeft = Math.ceil((sub.trialEndAt!.getTime() - now.getTime()) / 86_400_000);
      const user = await this.userModel.findById(sub.userId);
      if (user) {
        await this.emailSvc.sendTrialWarning((user as any).email, (user as any).firstName || 'there', daysLeft);
      }
    }

    if (expiredTrials.modifiedCount > 0 || expiredSubs.modifiedCount > 0) {
      this.logger.log(`Expired ${expiredTrials.modifiedCount} trials, ${expiredSubs.modifiedCount} subscriptions`);
    }
  }

  async getTrialStatus(userId: string) {
    const sub = await this.subModel.findOne({ userId });
    if (!sub) return { status: 'no_subscription', daysLeft: 0 };
    const now = new Date();
    let daysLeft = 0;
    if (sub.trialEndAt && sub.status === SubscriptionStatus.TRIAL) {
      daysLeft = Math.max(0, Math.ceil((sub.trialEndAt.getTime() - now.getTime()) / 86_400_000));
    }
    return {
      status: sub.status, planId: sub.planId, planName: sub.planName,
      trialEndAt: sub.trialEndAt, currentPeriodEnd: sub.currentPeriodEnd, daysLeft,
      eventsPerMonth: sub.eventsPerMonth, endpointsLimit: sub.endpointsLimit, retentionDays: sub.retentionDays,
    };
  }
}
