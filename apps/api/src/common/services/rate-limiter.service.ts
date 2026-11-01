import { Injectable, HttpException, HttpStatus, OnModuleDestroy } from '@nestjs/common';
import { ErrorCode } from '@csi/shared';

interface RateLimitRecord {
  timestamps: number[];
}

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly store = new Map<string, RateLimitRecord>();
  private readonly cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // AUD-PERF-01: Evict stale records every 5 minutes to prevent memory unbounded growth
    this.cleanupInterval = setInterval(() => {
      this.evictExpired();
    }, 5 * 60 * 1000);

    if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Asserts rate limit using in-memory sliding window (SEC-05, SEC-06).
   * @param key Unique key (e.g., "login:127.0.0.1" or "forgot:user@gcet.ac.in")
   * @param maxRequests Maximum allowable requests within window
   * @param windowMs Time window in milliseconds
   */
  assertLimit(key: string, maxRequests: number, windowMs: number): void {
    const now = Date.now();
    const windowStart = now - windowMs;

    let record = this.store.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.store.set(key, record);
    }

    // Filter out timestamps outside the active window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= maxRequests) {
      throw new HttpException(
        {
          error: {
            code: ErrorCode.RATE_LIMITED,
            message: 'Too many requests. Please try again later.',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.timestamps.push(now);
  }

  /**
   * Resets limit for a specific key (e.g. after successful login)
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Evicts expired timestamps and cleans up empty keys from in-memory store.
   * @param maxAgeMs Maximum age before a key is considered dead (defaults to 1 hour)
   */
  evictExpired(maxAgeMs: number = 60 * 60 * 1000): number {
    const now = Date.now();
    const threshold = now - maxAgeMs;
    let evictedCount = 0;

    for (const [key, record] of this.store.entries()) {
      record.timestamps = record.timestamps.filter((ts) => ts > threshold);
      if (record.timestamps.length === 0) {
        this.store.delete(key);
        evictedCount++;
      }
    }

    return evictedCount;
  }

  /**
   * Returns current active number of rate limit keys in memory.
   */
  getStoreSize(): number {
    return this.store.size;
  }
}
