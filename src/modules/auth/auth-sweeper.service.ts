import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class AuthSweeperService {
  private readonly logger = new Logger(AuthSweeperService.name);

  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

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
