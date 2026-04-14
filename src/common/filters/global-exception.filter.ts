import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { redactUrl } from '../interceptors/logging.interceptor';

let Sentry: any = null;
try { Sentry = require('@sentry/node'); } catch (_) {  }

const IS_PROD = process.env.NODE_ENV === 'production';

function sanitizeMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;
    if (typeof response === 'object' && response !== null) {
      const r = response as any;

      if (Array.isArray(r.message)) return r.message.join(', ');
      if (typeof r.message === 'string') return r.message;
      if (typeof r.error === 'string') return r.error;
    }
    return exception.message || 'Request failed';
  }

  if (IS_PROD) return 'Internal server error';

  if (exception instanceof Error) return exception.message;
  return String(exception);
}

function resolveStatus(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();

  if ((exception as any)?.code === 11000) return HttpStatus.CONFLICT;

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

    const safeUrl = redactUrl(req.url || '');
    const stack = exception instanceof Error ? exception.stack : String(exception);
    this.logger.error(`${req.method} ${safeUrl} → ${status}`, stack);

    if (status >= 500 && Sentry) {
      Sentry.captureException(exception);
    }

    const message = sanitizeMessage(exception);

    const validationErrors =
      exception instanceof HttpException &&
      typeof (exception.getResponse() as any) === 'object' &&
      Array.isArray((exception.getResponse() as any)?.message)
        ? { errors: (exception.getResponse() as any).message }
        : {};

    const requestId = (req as any).requestId || res.getHeader('x-request-id');

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      const existing = res.getHeader('Retry-After');
      if (!existing) {
        const ttl =
          (exception as any)?.response?.retryAfter ??
          (exception as any)?.retryAfter ??
          (exception as any)?.getResponse?.()?.retryAfter;
        const seconds = Number.isFinite(ttl) && ttl > 0 ? Math.ceil(Number(ttl)) : 60;
        res.setHeader('Retry-After', String(seconds));
      }
    }

    if (status === HttpStatus.SERVICE_UNAVAILABLE && !res.getHeader('Retry-After')) {
      res.setHeader('Retry-After', '5');
    }

    res.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: safeUrl,
      requestId,
      message,
      ...validationErrors,

      ...(IS_PROD ? {} : { debug: exception instanceof Error ? exception.stack?.split('\n').slice(0, 5) : undefined }),
    });
  }
}
