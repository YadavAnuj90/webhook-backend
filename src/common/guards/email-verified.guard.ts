
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const SKIP_EMAIL_VERIFICATION_KEY = 'skipEmailVerification';

export const SkipEmailVerification = () => SetMetadata(SKIP_EMAIL_VERIFICATION_KEY, true);

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_EMAIL_VERIFICATION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest();
    const user    = request.user;

    if (!user) return true;

    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Email address not verified. Please check your inbox and verify your email before continuing.',
      );
    }

    return true;
  }
}
