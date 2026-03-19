import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context }) =>
              `[${timestamp}] [${level}] [${context || 'App'}] ${message}`),
          ),
        }),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
      ],
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
        },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),
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
  ],
})
export class AppModule {}
