import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { TrialService } from './modules/billing/trial.service';
import { CreditsService } from './modules/billing/credits.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';

// ── Sentry (optional — enable with: npm install @sentry/node) ─────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
let Sentry: any = null;
try { Sentry = require('@sentry/node'); } catch (_) { /* not installed, ok */ }

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });

  // ── Replace NestJS default logger with Winston ────────────────────────────
  const winstonLogger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(winstonLogger);
  const logger = winstonLogger;

  // ── Init Sentry ────────────────────────────────────────────────────────────
  const sentryDsn = process.env.SENTRY_DSN;
  if (Sentry && sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.2,
    });
    logger.log('✅ Sentry initialized', 'Bootstrap');
  }

  // ── Helmet — hardened HTTP security headers ───────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'", "'unsafe-inline'"],   // Swagger UI needs inline scripts
        styleSrc:    ["'self'", "'unsafe-inline'"],
        imgSrc:      ["'self'", 'data:', 'https:'],
        connectSrc:  ["'self'"],
        frameSrc:    ["'none'"],
        objectSrc:   ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,   // Swagger UI iframes
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' },
    xXssProtection: false,              // modern browsers use CSP instead
    hidePoweredBy: true,
  }));
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
    .addTag('Auth',                   'Register, login, sessions, Google OAuth, password management')
    .addTag('Users',                  'Profile and admin user management')
    .addTag('Projects',               'Project / tenant management')
    .addTag('Workspaces',             'Multi-member workspace management')
    .addTag('Endpoints',              'Webhook endpoint configuration (URL, auth, retry policy)')
    .addTag('Events',                 'Webhook event dispatching, history, DLQ and GDPR erasure')
    .addTag('Webhooks',               'High-level webhook send, broadcast, replay and DLQ')
    .addTag('Analytics',              'Delivery stats, time-series charts, heatmap')
    .addTag('Alerts',                 'Alert rules for failure rate / latency thresholds')
    .addTag('API Keys',               'API key lifecycle management')
    .addTag('Transformations',        'Payload transformation rules (remove fields, rename, filter, template)')
    .addTag('Portal',                 'Customer-facing portal tokens and branding (white-label)')
    .addTag('Usage',                  'Plan usage, quota reporting and overage estimates')
    .addTag('Billing',                'Trial, subscriptions, credits, invoices, reseller billing')
    .addTag('Audit & History',        'Immutable audit log for all user and system actions')
    .addTag('Search',                 'Global full-text search across events, endpoints, projects')
    .addTag('Playground',             'Fire test HTTP requests and validate HMAC signatures')
    .addTag('Observability',          'Health checks (liveness / readiness probes)')
    .addTag('Metrics',                'Prometheus metrics scrape endpoint')
    .addTag('AI',                     'Natural language debugger, schema generator, DLQ triage, PII detector')
    .addTag('Event Catalog',          'Event type registry with JSON Schema validation and contract testing')
    .addTag('Operational Webhooks',   'System-event webhooks (delivery.success, delivery.failed, etc.)')
    .addTag('Tunnel',                 'CLI dev tunnel — forward live webhooks to localhost during development')
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
