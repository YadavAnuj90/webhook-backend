import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// eslint-disable-next-line @typescript-eslint/no-var-requires
let Sentry: any = null;
try { Sentry = require('@sentry/node'); } catch (_) { /* not installed */ }

const IS_PROD = process.env.NODE_ENV === 'production';

/** User-safe messages for common Mongoose / internal errors */
function sanitizeMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (typeof response === 'object' && response !== null) {
      const r = response as any;
      // class-validator returns { message: string[] } — pass through validation errors
      if (Array.isArray(r.message)) return r.message.join(', ');
      if (typeof r.message === 'string') return r.message;
      if (typeof r.error === 'string') return r.error;
    }
    return exception.message || 'Request failed';
  }

  // In production, NEVER expose internal error details
  if (IS_PROD) return 'Internal server error';

  // In development, pass through for easier debugging
  if (exception instanceof Error) return exception.message;
  return String(exception);
}

/** Determine HTTP status safely */
function resolveStatus(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();

  // Mongoose duplicate key error
  if ((exception as any)?.code === 11000) return HttpStatus.CONFLICT;
  // Mongoose cast / validation error
  if ((exception as any)?.name === 'CastError') return HttpStatus.BAD_REQUEST;
  if ((exception as any)?.name === 'ValidationError') return HttpStatus.UNPROCESSABLE_ENTITY;

  return HttpStatus.INTERNAL_SERVER_ERROR;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx    = host.switchToHttp();
    const res    = ctx.getResponse<Response>();
    const req    = ctx.getRequest<Request>();
    const status = resolveStatus(exception);

    // ── Log ────────────────────────────────────────────────────────────────
    // Always log full stack internally; never send it to the client in prod
    const stack = exception instanceof Error ? exception.stack : String(exception);
    this.logger.error(`${req.method} ${req.url} → ${status}`, stack);

    // ── Forward 5xx to Sentry ──────────────────────────────────────────────
    if (status >= 500 && Sentry) {
      Sentry.captureException(exception);
    }

    // ── Build safe response ────────────────────────────────────────────────
    const message = sanitizeMessage(exception);

    // class-validator validation errors: expose individual field errors
    const validationErrors =
      exception instanceof HttpException &&
      typeof (exception.getResponse() as any) === 'object' &&
      Array.isArray((exception.getResponse() as any)?.message)
        ? { errors: (exception.getResponse() as any).message }
        : {};

    res.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: req.url,
      message,
      ...validationErrors,
      // Only include stack trace in development
      ...(IS_PROD ? {} : { debug: exception instanceof Error ? exception.stack?.split('\n').slice(0, 5) : undefined }),
    });
  }
}
