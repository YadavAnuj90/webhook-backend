
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

export const CacheTtl = (ttlSeconds: number) => SetMetadata(CACHE_TTL_KEY, ttlSeconds);

const MAX_CACHE_SIZE = 2000;

interface CacheEntry {
  value: any;
  expiresAt: number;
  lastAccessed: number;
}

@Injectable()
export class CacheResponseInterceptor implements NestInterceptor {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    if (req.method !== 'GET') return next.handle();

    const ttlSeconds = this.reflector.getAllAndOverride<number>(CACHE_TTL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const ttlMs = (ttlSeconds ?? 30) * 1000;

    const userId  = req.user?.id ?? 'anon';
    const cacheKey = `${userId}:${req.url}`;

    const cached = this.store.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      cached.lastAccessed = Date.now();
      return of(cached.value);
    }

    return next.handle().pipe(
      tap((data) => {
        // Evict expired entries first, then LRU if still over limit
        if (this.store.size >= MAX_CACHE_SIZE) {
          this.evict();
        }
        this.store.set(cacheKey, { value: data, expiresAt: Date.now() + ttlMs, lastAccessed: Date.now() });
      }),
    );
  }

  private evict(): void {
    const now = Date.now();
    // Phase 1: remove expired entries
    for (const [k, v] of this.store.entries()) {
      if (v.expiresAt < now) this.store.delete(k);
    }
    // Phase 2: if still over limit, remove least-recently-accessed entries
    if (this.store.size >= MAX_CACHE_SIZE) {
      const entries = Array.from(this.store.entries())
        .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
      const toRemove = Math.max(entries.length - Math.floor(MAX_CACHE_SIZE * 0.75), 1);
      for (let i = 0; i < toRemove; i++) {
        this.store.delete(entries[i][0]);
      }
    }
  }
}
