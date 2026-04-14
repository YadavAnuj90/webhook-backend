import {
  Injectable, BadRequestException, UnauthorizedException,
  NotFoundException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/schemas/user.schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  private readonly TOTP_STEP    = 30;
  private readonly TOTP_DIGITS  = 6;
  private readonly TOTP_WINDOW  = 1;
  private readonly RECOVERY_CODE_COUNT = 10;

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private config: ConfigService,
    private auditService: AuditService,
  ) {}

  async generateSetup(userId: string): Promise<{
    secret: string;
    otpauthUrl: string;
    qrData: string;
    recoveryCodes: string[];
  }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }

    const secretBuffer = randomBytes(20);
    const secret = this.base32Encode(secretBuffer);

    const recoveryCodes = Array.from({ length: this.RECOVERY_CODE_COUNT }, () =>
      randomBytes(5).toString('hex'),
    );

    const hashedRecoveryCodes = recoveryCodes.map((code) =>
      createHash('sha256').update(code).digest('hex'),
    );

    const encryptedSecret = this.encryptSecret(secret);
    await this.userModel.findByIdAndUpdate(userId, {
      twoFactorSecret: encryptedSecret,
      twoFactorRecoveryCodes: hashedRecoveryCodes,

    });

    const issuer = this.config.get('APP_NAME', 'WebhookOS');
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${this.TOTP_DIGITS}&period=${this.TOTP_STEP}`;

    return {
      secret,
      otpauthUrl,
      qrData: otpauthUrl,
      recoveryCodes,
    };
  }

  async verifyAndEnable(userId: string, code: string, ip: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Call /auth/2fa/setup first to generate a secret');
    }

    const secret = this.decryptSecret(user.twoFactorSecret);
    if (!this.verifyTotp(secret, code)) {
      throw new BadRequestException('Invalid TOTP code. Please check your authenticator app and try again.');
    }

    await this.userModel.findByIdAndUpdate(userId, { twoFactorEnabled: true });
    await this.auditService.log({
      userId, userEmail: user.email,
      action: AuditAction.TWO_FACTOR_ENABLED,
      ipAddress: ip,
    });

    this.logger.log(`2FA enabled for user ${user.email}`);
    return { message: 'Two-factor authentication enabled successfully' };
  }

  async disable(userId: string, code: string, ip: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const secret = this.decryptSecret(user.twoFactorSecret!);
    if (!this.verifyTotp(secret, code)) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    await this.userModel.findByIdAndUpdate(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: [],
    });

    await this.auditService.log({
      userId, userEmail: user.email,
      action: AuditAction.TWO_FACTOR_DISABLED,
      ipAddress: ip,
    });

    this.logger.log(`2FA disabled for user ${user.email}`);
    return { message: 'Two-factor authentication disabled' };
  }

  async validateLoginCode(userId: string, code: string): Promise<boolean> {
    const user = await this.userModel.findById(userId);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) return false;

    const secret = this.decryptSecret(user.twoFactorSecret);

    if (this.verifyTotp(secret, code)) return true;

    const codeHash = createHash('sha256').update(code).digest('hex');
    const result = await this.userModel.findOneAndUpdate(
      { _id: userId, twoFactorRecoveryCodes: codeHash },
      { $pull: { twoFactorRecoveryCodes: codeHash } },
      { new: true },
    );

    if (result) {
      this.logger.warn(`Recovery code used for user ${user.email} — ${result.twoFactorRecoveryCodes?.length || 0} remaining`);
      return true;
    }

    return false;
  }

  async regenerateRecoveryCodes(
    userId: string,
    code: string,
    ip: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const secret = this.decryptSecret(user.twoFactorSecret!);
    if (!this.verifyTotp(secret, code)) {
      throw new UnauthorizedException('Invalid TOTP code');
    }

    const recoveryCodes = Array.from({ length: this.RECOVERY_CODE_COUNT }, () =>
      randomBytes(5).toString('hex'),
    );
    const hashedRecoveryCodes = recoveryCodes.map((c) =>
      createHash('sha256').update(c).digest('hex'),
    );

    await this.userModel.findByIdAndUpdate(userId, {
      twoFactorRecoveryCodes: hashedRecoveryCodes,
    });

    await this.auditService.log({
      userId, userEmail: user.email,
      action: AuditAction.TWO_FACTOR_RECOVERY_REGENERATED,
      ipAddress: ip,
    });

    return { recoveryCodes };
  }

  async getStatus(userId: string): Promise<{
    enabled: boolean;
    recoveryCodesRemaining: number;
  }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return {
      enabled: user.twoFactorEnabled,
      recoveryCodesRemaining: user.twoFactorRecoveryCodes?.length || 0,
    };
  }

  private verifyTotp(base32Secret: string, code: string): boolean {
    const now = Math.floor(Date.now() / 1000);

    for (let i = -this.TOTP_WINDOW; i <= this.TOTP_WINDOW; i++) {
      const counter = Math.floor((now + i * this.TOTP_STEP) / this.TOTP_STEP);
      const expected = this.generateHotp(base32Secret, counter);
      if (expected === code) return true;
    }
    return false;
  }

  private generateHotp(base32Secret: string, counter: number): string {
    const { createHmac } = require('crypto');
    const key = this.base32Decode(base32Secret);

    const buffer = Buffer.alloc(8);
    let tmp = counter;
    for (let i = 7; i >= 0; i--) {
      buffer[i] = tmp & 0xff;
      tmp = Math.floor(tmp / 256);
    }

    const hmac = createHmac('sha1', key).update(buffer).digest();

    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binary % 10 ** this.TOTP_DIGITS;
    return otp.toString().padStart(this.TOTP_DIGITS, '0');
  }

  private base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 0x1f];
        bits -= 5;
      }
    }
    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 0x1f];
    }
    return output;
  }

  private base32Decode(encoded: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const stripped = encoded.replace(/=+$/, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const output: number[] = [];
    for (const char of stripped) {
      const idx = alphabet.indexOf(char);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(output);
  }

  private getEncryptionKey(): Buffer {
    const keyHex = this.config.get<string>('TWO_FACTOR_ENCRYPTION_KEY') ||
                   this.config.get<string>('PAYLOAD_ENCRYPTION_KEY') ||
                   createHash('sha256').update(this.config.get('JWT_SECRET', 'default-dev-key')).digest('hex');
    return Buffer.from(keyHex.slice(0, 64), 'hex');
  }

  private encryptSecret(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `2fa:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decryptSecret(ciphertext: string): string {
    if (!ciphertext.startsWith('2fa:')) return ciphertext;
    const [, ivHex, tagHex, dataHex] = ciphertext.split(':');
    const key = this.getEncryptionKey();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(dataHex, 'hex')) + decipher.final('utf8');
  }
}
