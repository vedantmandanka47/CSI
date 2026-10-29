import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@csi/shared';

interface RateLimitRecord {
  timestamps: number[];
}

@Injectable()
export class RateLimiterService {
  private readonly store = new Map<string, RateLimitRecord>();

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
}
