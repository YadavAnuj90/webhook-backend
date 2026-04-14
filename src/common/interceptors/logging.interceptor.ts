import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
  Inject, Optional, Logger,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

/**
 * Redaction list — any query param / header whose *name* matches one of these
 * is replaced with `***` in logs. Matching is case-insensitive, substring-based,
 * so `authorization`, `X-API-Key`, `cookie`, `refresh_token` etc. are all caught.
 */
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

/** Strip sensitive query params from a URL, preserving structure. */
export function redactUrl(url: string): string {
  try {
    // URL needs a base; the URL might be a path+query only.
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
  ) {}

  private get log() { return this.winston ?? this.fallback; }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const start = Date.now();

    // Attach / propagate a request-ID for distributed tracing
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const safeUrl = redactUrl(req.url || '');

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        this.log.log(
          `${req.method} ${safeUrl} ${res.statusCode} ${ms}ms [${requestId}]`,
          'HTTP',
        );
      }),
      catchError(err => {
        const ms = Date.now() - start;
        this.log.error(
          `${req.method} ${safeUrl} ERR ${ms}ms [${requestId}] — ${err?.message}`,
          err?.stack,
          'HTTP',
        );
        return throwError(() => err);
      }),
    );
  }
}
