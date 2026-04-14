import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
// Optional daily-rotate transport — falls back gracefully if not installed
// eslint-disable-next-line @typescript-eslint/no-var-requires
let DailyRotateFile: any = null;
try { DailyRotateFile = require('winston-daily-rotate-file'); } catch { /* optional */ }

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';
import { SearchModule } from './modules/search/search.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { EndpointsModule } from './modules/endpoints/endpoints.module';
import { EventsModule } from './modules/events/events.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { ApiKeysModule } from './modules/apikeys/apikeys.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { PlaygroundModule } from './modules/playground/playground.module';
import { TransformationsModule } from './modules/transformations/transformations.module';
import { PortalModule } from './modules/portal/portal.module';
import { UsageModule } from './modules/usage/usage.module';

// ─── New Feature Modules ──────────────────────────────────────────────────────
import { EventCatalogModule } from './modules/event-catalog/event-catalog.module';
import { TunnelModule } from './modules/tunnel/tunnel.module';
import { OperationalWebhooksModule } from './modules/operational-webhooks/operational-webhooks.module';
import { DeduplicationModule } from './modules/deduplication/deduplication.module';
import { SlaModule } from './modules/sla/sla.module';
import { AiModule } from './modules/ai/ai.module';
import { BillingModule } from './modules/billing/billing.module';
import { CareersModule } from './modules/careers/careers.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { ProjectAccessModule } from './common/guards/project-access.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WinstonModule.forRootAsync({
      useFactory: () => {
        const isProd = process.env.NODE_ENV === 'production';
        const consoleFormat = isProd
          ? winston.format.combine(
              winston.format.timestamp(),
              winston.format.errors({ stack: true }),
              winston.format.json(),                        // structured JSON in prod
            )
          : winston.format.combine(
              winston.format.timestamp({ format: 'HH:mm:ss' }),
              winston.format.colorize(),
              winston.format.errors({ stack: true }),
              winston.format.printf(({ timestamp, level, message, context, stack }) =>
                `${timestamp} [${level}] [${context || 'App'}] ${message}${stack ? '\n' + stack : ''}`),
            );
        const jsonFmt = winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json(),
        );
        // Prefer daily rotate if available; fall back to size-capped files.
        const errorTransport = DailyRotateFile
          ? new DailyRotateFile({
              filename: 'logs/error-%DATE%.log',
              datePattern: 'YYYY-MM-DD',
              zippedArchive: true,
              maxSize: '20m',
              maxFiles: '14d',
              level: 'error',
              format: jsonFmt,
            })
          : new winston.transports.File({
              filename: 'logs/error.log',
              level: 'error',
              maxsize: 20 * 1024 * 1024,
              maxFiles: 5,
              tailable: true,
              format: jsonFmt,
            });
        const combinedTransport = DailyRotateFile
          ? new DailyRotateFile({
              filename: 'logs/combined-%DATE%.log',
              datePattern: 'YYYY-MM-DD',
              zippedArchive: true,
              maxSize: '50m',
              maxFiles: '14d',
              format: jsonFmt,
            })
          : new winston.transports.File({
              filename: 'logs/combined.log',
              maxsize: 50 * 1024 * 1024,
              maxFiles: 5,
              tailable: true,
              format: jsonFmt,
            });
        return {
          transports: [
            new winston.transports.Console({ format: consoleFormat }),
            errorTransport,
            combinedTransport,
          ],
        };
      },
    }),
    MongooseModule.forRootAsync({
      useFactory: (cfg: ConfigService) => ({ uri: cfg.get('MONGODB_URI') }),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      useFactory: (cfg: ConfigService) => ({
        redis: {
          host: cfg.get('REDIS_HOST', 'localhost'),
          port: cfg.get<number>('REDIS_PORT', 6379),
          password: cfg.get('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          retryStrategy: (times: number) => Math.min(1000 * Math.pow(2, times), 30_000),
        },
        prefix: cfg.get('BULL_PREFIX', 'bull'),
        defaultJobOptions: {
          attempts: 1,               // retries are re-scheduled explicitly by DeliveryService
          removeOnComplete: { age: 3600, count: 5_000 },    // keep 1h / 5k for debugging
          removeOnFail:     { age: 7 * 86400, count: 20_000 }, // keep 7d / 20k
          backoff: { type: 'exponential', delay: 2_000 },
        },
        settings: {
          // Time a job can hold the lock before BullMQ reclaims it
          lockDuration: 60_000,
          stalledInterval: 30_000,
          maxStalledCount: 2,
        },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'global', ttl: 60_000, limit: 1000 },       // 1000 req/min global
        { name: 'auth',   ttl: 60_000, limit: 10   },       // 10 req/min on auth routes
        { name: 'authIp', ttl: 60_000, limit: 20   },       // per-IP fallback on auth routes
      ],
      // Prefer X-Forwarded-For when behind a trusted proxy, else peer IP.
      getTracker: (req: any) =>
        (req.headers['x-forwarded-for']?.split(',')[0].trim())
        || req.ip
        || req.connection?.remoteAddress
        || 'anon',
    }),
    ScheduleModule.forRoot(),

    // Core modules
    AuthModule, UsersModule, AuditModule, SearchModule, PaymentsModule,
    EndpointsModule, EventsModule, DeliveryModule, ProjectsModule, WebhooksModule,
    AnalyticsModule, HealthModule, MetricsModule, NotificationsModule,
    WorkspacesModule, ApiKeysModule, AlertsModule, PlaygroundModule,
    TransformationsModule, PortalModule, UsageModule,

    // New feature modules
    EventCatalogModule,
    TunnelModule,
    OperationalWebhooksModule,
    DeduplicationModule,
    SlaModule,

    // AI Features (Gemini)
    AiModule,

    // ─── Billing: Trial, Subscriptions, Credits, Reseller ────────────────────
    BillingModule,

    // Careers: public job listings + admin management
    CareersModule,

    // Real-time WebSocket gateway
    RealtimeModule,

    // Delayed webhook scheduling
    SchedulingModule,

    // Fine-grained RBAC permissions
    PermissionsModule,

    // Resource-scoped project access guard (global)
    ProjectAccessModule,
  ],
  providers: [
    // ── Global rate-limit guard (applies to every route; skip with @SkipThrottle()) ──
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
