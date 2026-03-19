import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { TrialService } from './modules/billing/trial.service';
import { CreditsService } from './modules/billing/credits.service';
import helmet from 'helmet';

// ── Sentry (optional — enable with: npm install @sentry/node) ─────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
let Sentry: any = null;
try { Sentry = require('@sentry/node'); } catch (_) { /* not installed, ok */ }

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const logger = new Logger('Bootstrap');

  // ── Init Sentry ────────────────────────────────────────────────────────────
  const sentryDsn = process.env.SENTRY_DSN;
  if (Sentry && sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.2,
    });
    logger.log('✅ Sentry initialized');
  }

  app.use(helmet());
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3001', credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ── Global subscription enforcement (trial expiry / payment required) ──────
  const reflector   = app.get(Reflector);
  const trialSvc    = app.get(TrialService);
  app.useGlobalGuards(new SubscriptionGuard(trialSvc, reflector));

  // ── Seed default credit packages if not present ───────────────────────────
  try {
    const creditsSvc = app.get(CreditsService);
    await creditsSvc.seedDefaultPackages();
  } catch (_) { /* ignore on first boot */ }

  const config = new DocumentBuilder()
    .setTitle('WebhookOS API')
    .setDescription(
      'Webhook delivery platform — v3\n\n' +
      '**Authentication:** Use either:\n' +
      '- `Authorization: Bearer <JWT>` — obtained from `/auth/login`\n' +
      '- `X-API-Key: <key>` — obtained from `/api-keys` (create an API key)',
    )
    .setVersion('3.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT access token from /auth/login' },
      'JWT',
    )
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'API key from /api-keys (create)' },
      'X-API-Key',
    )
    .addTag('Auth', 'Register, login, sessions, password management')
    .addTag('Users', 'Profile and admin user management')
    .addTag('Projects', 'Project / tenant management')
    .addTag('Workspaces', 'Multi-member workspace management')
    .addTag('Endpoints', 'Webhook endpoint configuration')
    .addTag('Events', 'Webhook event dispatching and history')
    .addTag('Webhooks', 'High-level webhook send, broadcast, replay and DLQ')
    .addTag('Analytics', 'Delivery stats and time-series charts')
    .addTag('Alerts', 'Alert rules for failure / latency thresholds')
    .addTag('API Keys', 'API key lifecycle management')
    .addTag('Transformations', 'Payload transformation rules')
    .addTag('Portal', 'Customer-facing portal token management')
    .addTag('Usage', 'Plan usage and quota reporting')
    .addTag('Billing', 'Trial, subscriptions, credits, invoices, reseller billing')
    .addTag('Audit & History', 'Audit log for user and system actions')
    .addTag('Search', 'Global full-text search')
    .addTag('Playground', 'Test webhook delivery and validate signatures')
    .addTag('Observability', 'Health checks (liveness / readiness)')
    .addTag('Metrics', 'Prometheus metrics scrape endpoint')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 WebhookOS running on http://localhost:${port}`);
  logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
