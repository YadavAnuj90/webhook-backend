import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthSweeperService } from './auth-sweeper.service';
import { TwoFactorService } from './two-factor.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
// Use the canonical ApiKey schema from the apikeys module to prevent two registrations
// of the same Mongoose model name with different field definitions.
import { ApiKey, ApiKeySchema } from '../apikeys/schemas/apikey.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get('JWT_EXPIRES_IN', '15m') },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: ApiKey.name, schema: ApiKeySchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuditModule,
    BillingModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthSweeperService, TwoFactorService, JwtStrategy, GoogleStrategy],
  exports: [AuthService, TwoFactorService, JwtModule],
})
export class AuthModule {}
