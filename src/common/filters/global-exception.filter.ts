import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

// eslint-disable-next-line @typescript-eslint/no-var-requires
let Sentry: any = null;
try { Sentry = require('@sentry/node'); } catch (_) { /* not installed */ }

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof HttpException ? exception.getResponse() : 'Internal server error';
    this.logger.error(`${req.method} ${req.url} → ${status}`, exception instanceof Error ? exception.stack : String(exception));

    // Forward 5xx errors to Sentry
    if (status >= 500 && Sentry) {
      Sentry.captureException(exception);
    }

    res.status(status).json({ statusCode: status, timestamp: new Date().toISOString(), path: req.url, message });
  }
}
