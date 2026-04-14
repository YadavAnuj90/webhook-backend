import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';

/**
 * Clears out expired one-time tokens (password reset + email verification)
 * and stale refresh-token sessions.  Prevents the users collection from
 * accumulating dead token material that no longer serves a purpose and
 * could, in the worst case, be a weak link for offline cracking attempts.
 */
@Injectable()
export class AuthSweeperService {
  private readonly logger = new Logger(AuthSweeperService.name);

  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  /** Every 15 minutes: strip expired password-reset tokens. */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async purgeExpiredPasswordResetTokens() {
    const now = new Date();
    const res = await this.userModel.updateMany(
      { passwordResetExpiry: { $lte: now }, passwordResetToken: { $ne: null } },
      { $set: { passwordResetToken: null, passwordResetExpiry: null } },
    );
    if (res.modifiedCount) {
      this.logger.log(`🔑 Cleared ${res.modifiedCount} expired password-reset tokens`);
    }
  }

  /**
   * Daily: purge email-verification tokens older than VERIFY_TOKEN_TTL_DAYS (default 14).
   * Users who don't verify in that window must request a fresh token.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeStaleVerifyTokens() {
    const days = parseInt(process.env.VERIFY_TOKEN_TTL_DAYS || '14', 10);
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const res = await this.userModel.updateMany(
      {
        emailVerified: false,
        emailVerifyToken: { $ne: null },
        createdAt: { $lt: cutoff },
      },
      { $set: { emailVerifyToken: null } },
    );
    if (res.modifiedCount) {
      this.logger.log(`✉️  Cleared ${res.modifiedCount} stale email-verify tokens (>${days}d)`);
    }
  }

  /**
   * Hourly: drop refresh-token sessions whose `lastUsed` is older than
   * REFRESH_TOKEN_TTL_DAYS (default 30) — an inactive session is effectively
   * expired and should not linger in the user document.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeStaleSessions() {
    const days = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const res = await this.userModel.updateMany(
      { 'sessions.lastUsed': { $lt: cutoff } },
      { $pull: { sessions: { lastUsed: { $lt: cutoff } } } },
    );
    if (res.modifiedCount) {
      this.logger.log(`🔒 Pruned inactive sessions from ${res.modifiedCount} users (>${days}d)`);
    }
  }
}
