/**
 * EmailVerifiedGuard
 * ──────────────────
 * Blocks API access for users who have not yet verified their email address.
 *
 * Apply globally (after JwtAuthGuard) or per-controller / per-route:
 *
 *   // Global — add to app.useGlobalGuards() AFTER AuthGuard
 *   app.useGlobalGuards(new EmailVerifiedGuard(reflector));
 *
 *   // Per-controller
 *   @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
 *   @Controller('endpoints')
 *   export class EndpointsController {}
 *
 * Skip on specific routes with @SkipEmailVerification():
 *
 *   @SkipEmailVerification()
 *   @Get('profile')
 *   getProfile() {}
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const SKIP_EMAIL_VERIFICATION_KEY = 'skipEmailVerification';

/** Decorator — place on routes that should be accessible even without email verification */
export const SkipEmailVerification = () => SetMetadata(SKIP_EMAIL_VERIFICATION_KEY, true);

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Allow if the handler or controller explicitly opts out
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_EMAIL_VERIFICATION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest();
    const user    = request.user;

    // No user = not authenticated — let AuthGuard handle this separately
    if (!user) return true;

    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Email address not verified. Please check your inbox and verify your email before continuing.',
      );
    }

    return true;
  }
}
