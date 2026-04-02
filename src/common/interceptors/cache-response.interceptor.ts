/**
 * CacheResponseInterceptor
 * ─────────────────────────
 * Simple in-memory LRU-style cache for GET responses.
 * Use on read-heavy, low-volatility endpoints (analytics, usage summaries, plans).
 *
 * Usage:
 *   @UseInterceptors(CacheResponseInterceptor)        // default 30 s TTL
 *   @CacheTtl(60)                                     // override to 60 s
 *   @Get('summary')
 *   getSummary() {}
 *
 * Cache is keyed by:  `${userId}:${method}:${url}` — so each user gets
 * their own cache entry (no cross-user data leakage).
 *
 * For Redis-backed distributed caching (multiple instances) replace the
 * Map with an ioredis client. The interface stays identical.
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

export const CACHE_TTL_KEY = 'cache_ttl';
/** Override the default 30 s TTL on a per-route basis (seconds) */
export const CacheTtl = (ttlSeconds: number) => SetMetadata(CACHE_TTL_KEY, ttlSeconds);

const DEFAULT_TTL_MS = 30_000; // 30 seconds

interface CacheEntry {
  value: any;
  expiresAt: number;
}

@Injectable()
export class CacheResponseInterceptor implements NestInterceptor {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    // Only cache GET requests
    if (req.method !== 'GET') return next.handle();

    const ttlSeconds = this.reflector.getAllAndOverride<number>(CACHE_TTL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const ttlMs = (ttlSeconds ?? 30) * 1000;

    // Cache key: userId (or 'anon') + full URL
    const userId  = req.user?.id ?? 'anon';
    const cacheKey = `${userId}:${req.url}`;

    const cached = this.store.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return of(cached.value);
    }

    return next.handle().pipe(
      tap((data) => {
        this.store.set(cacheKey, { value: data, expiresAt: Date.now() + ttlMs });

        // Housekeeping: evict expired entries every 500 cache writes to avoid memory leak
        if (this.store.size % 500 === 0) {
          const now = Date.now();
          for (const [k, v] of this.store.entries()) {
            if (v.expiresAt < now) this.store.delete(k);
          }
        }
      }),
    );
  }
}
