import {
  Injectable, CanActivate, ExecutionContext, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TrialService } from '../../modules/billing/trial.service';

export const SKIP_SUBSCRIPTION_CHECK = 'skipSubscriptionCheck';
/** Decorator: skip subscription check on a route */
export const Public = () => SetMetadata(SKIP_SUBSCRIPTION_CHECK, true);

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private trialService: TrialService,
    private reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Allow if route is marked public/skip
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_CHECK, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (skip) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;

    // No user = let JWT guard handle it; don't double-block
    if (!user) return true;

    // Super admins bypass subscription check
    if (user.role === 'super_admin') return true;

    const { allowed, reason } = await this.trialService.isAllowed(user.userId || user.sub || user.id);
    if (!allowed) {
      const err: any = new Error(reason || 'Subscription required');
      err.status = 402;
      err.response = {
        statusCode: 402,
        error: 'Payment Required',
        message: this.humanReason(reason),
        code: reason,
      };
      throw err;
    }

    return true;
  }

  private humanReason(reason?: string): string {
    switch (reason) {
      case 'trial_expired':       return 'Your 10-day free trial has expired. Please upgrade to a paid plan to continue.';
      case 'subscription_expired':return 'Your subscription has expired. Please renew to continue.';
      case 'payment_past_due':    return 'Your payment is past due. Please update your payment method.';
      case 'account_suspended':   return 'Your account has been suspended. Please contact support.';
      case 'subscription_cancelled': return 'Your subscription is cancelled. Please subscribe again to continue.';
      default:                    return 'Subscription required to access this resource.';
    }
  }
}
