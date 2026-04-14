import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { SubscriptionGuard } from './common/guards/subscription.guard';
import { EmailVerifiedGuard } from './common/guards/email-verified.guard';
import { TrialService } from './modules/billing/trial.service';
import { CreditsService } from './modules/billing/credits.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import * as express from 'express';
import { setupBullBoard } from './common/bull-board/bull-board.setup';
import { join } from 'path';

let compression: any = null;
try { compression = require('compression'); } catch (_) {  }

let Sentry: any = null;
try { Sentry = require('@sentry/node'); } catch (_) {  }

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });

  const winstonLogger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(winstonLogger);
  const logger = winstonLogger;

  const sentryDsn = process.env.SENTRY_DSN;
  if (Sentry && sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.2,
    });
    logger.log('✅ Sentry initialized', 'Bootstrap');
  }

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'", "'unsafe-inline'"],
        styleSrc:    ["'self'", "'unsafe-inline'"],
        imgSrc:      ["'self'", 'data:', 'https:'],
        connectSrc:  ["'self'"],
        frameSrc:    ["'none'"],
        objectSrc:   ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' },
    xXssProtection: false,
    hidePoweredBy: true,
  }));
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3001', credentials: true });
  app.setGlobalPrefix('api/v1');

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);
  app.use((req: any, res: any, next: any) => {

    if (req.url.startsWith('/api/v1/realtime') || req.url.startsWith('/socket.io')) return next();
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      if (!res.headersSent) res.status(504).json({ statusCode: 504, message: 'Request timed out', path: req.url });
      req.destroy();
    });
    next();
  });

  const metricsAllow = (process.env.METRICS_ALLOW_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  const metricsToken = process.env.METRICS_TOKEN || '';
  app.use((req: any, res: any, next: any) => {
    if (!req.url.startsWith('/api/v1/metrics') && !req.url.startsWith('/metrics')) return next();
    const ip = (req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.ip || req.connection?.remoteAddress || '';
    const tokenOk = metricsToken && req.headers['x-metrics-token'] === metricsToken;
    const ipOk    = metricsAllow.length > 0 && metricsAllow.includes(ip);
    if (!metricsToken && metricsAllow.length === 0) return next();
    if (tokenOk || ipOk) return next();
    return res.status(403).json({ statusCode: 403, message: 'Metrics endpoint forbidden' });
  });

  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  if (compression) app.use(compression());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const reflector   = app.get(Reflector);
  const trialSvc    = app.get(TrialService);

  app.useGlobalGuards(new EmailVerifiedGuard(reflector));
  app.useGlobalGuards(new SubscriptionGuard(trialSvc, reflector));

  await setupBullBoard(app);

  try {
    const creditsSvc = app.get(CreditsService);
    await creditsSvc.seedDefaultPackages();
  } catch (_) {  }

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
    .addTag('Realtime',               'WebSocket real-time delivery event feed (connect to /realtime namespace)')
    .addTag('Scheduling',             'Delayed webhook delivery — schedule events for future delivery')
    .addTag('Permissions',            'Fine-grained RBAC permission management for projects and workspaces')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 WebhookOS running on http://localhost:${port}`);
  logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`Received ${signal} — closing server gracefully…`, 'Bootstrap');
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown took too long — forcing exit', 'Bootstrap');
      process.exit(1);
    }, 30_000);
    forceExit.unref();
    try {

      await app.close();
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      logger.error(`Error during shutdown: ${(err as Error)?.message}`, (err as Error)?.stack, 'Bootstrap');
      clearTimeout(forceExit);
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason: any) => {
    logger.error(`UnhandledRejection: ${reason?.message || reason}`, reason?.stack, 'Bootstrap');
  });
  process.on('uncaughtException', (err: Error) => {
    logger.error(`UncaughtException: ${err.message}`, err.stack, 'Bootstrap');
    shutdown('uncaughtException');
  });
}
bootstrap();
