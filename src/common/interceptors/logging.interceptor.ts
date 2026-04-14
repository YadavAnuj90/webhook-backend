import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
  Inject, Optional, Logger,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { MetricsService } from '../../modules/metrics/metrics.service';

const SENSITIVE_KEY_PATTERNS = [
  'authorization', 'cookie', 'set-cookie',
  'api-key', 'apikey', 'x-api-key',
  'token', 'secret', 'password',
  'x-webhook-signature',
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some(p => lower.includes(p));
}

export function redactUrl(url: string): string {
  try {

    const hasProto = /^[a-z]+:\/\//i.test(url);
    const u = new URL(url, hasProto ? undefined : 'http://x');
    let changed = false;
    for (const key of Array.from(u.searchParams.keys())) {
      if (isSensitiveKey(key)) {
        u.searchParams.set(key, '***');
        changed = true;
      }
    }
    if (!changed) return url;
    return hasProto ? u.toString() : `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly fallback = new Logger('HTTP');

  constructor(
    @Optional() @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly winston?: any,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  private routeLabel(url: string): string {
    const path = url.split('?')[0];
    return path
      .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id')
      .replace(/\/[0-9a-f-]{36}(?=\/|$)/gi, '/:uuid')
      .replace(/\/\d+(?=\/|$)/g, '/:n');
  }

  private get log() { return this.winston ?? this.fallback; }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const start = Date.now();

    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const safeUrl = redactUrl(req.url || '');

    const route = this.routeLabel(req.url || '');

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        this.log.log(
          `${req.method} ${safeUrl} ${res.statusCode} ${ms}ms [${requestId}]`,
          'HTTP',
        );
        this.metrics?.httpRequestDuration.observe(
          { method: req.method, route, status_code: String(res.statusCode) },
          ms,
        );
      }),
      catchError(err => {
        const ms = Date.now() - start;
        this.log.error(
          `${req.method} ${safeUrl} ERR ${ms}ms [${requestId}] — ${err?.message}`,
          err?.stack,
          'HTTP',
        );
        this.metrics?.httpRequestDuration.observe(
          { method: req.method, route, status_code: String(err?.status || 500) },
          ms,
        );
        return throwError(() => err);
      }),
    );
  }
}
