import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
  Inject, Optional, Logger,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

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

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        this.log.log(
          `${req.method} ${req.url} ${res.statusCode} ${ms}ms [${requestId}]`,
          'HTTP',
        );
      }),
      catchError(err => {
        const ms = Date.now() - start;
        this.log.error(
          `${req.method} ${req.url} ERR ${ms}ms [${requestId}] — ${err?.message}`,
          err?.stack,
          'HTTP',
        );
        return throwError(() => err);
      }),
    );
  }
}
