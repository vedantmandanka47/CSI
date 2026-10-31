import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface RateLimitRecord {
  timestamps: number[];
}

@Injectable()
export class PublicVerificationRateLimitGuard implements CanActivate {
  private readonly windowMs = 60 * 1000; // 1 minute window
  private readonly maxRequests = 30; // Max 30 requests per minute per IP
  private readonly store = new Map<string, RateLimitRecord>();

  constructor() {
    // Periodic cleanup of stale IP records every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [ip, record] of this.store.entries()) {
        const active = record.timestamps.filter((ts) => now - ts < this.windowMs);
        if (active.length === 0) {
          this.store.delete(ip);
        } else {
          record.timestamps = active;
        }
      }
    }, 5 * 60 * 1000).unref();
  }

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';

    const now = Date.now();
    let record = this.store.get(clientIp);

    if (!record) {
      record = { timestamps: [] };
      this.store.set(clientIp, record);
    }

    // Filter out timestamps outside the active window
    record.timestamps = record.timestamps.filter((ts) => now - ts < this.windowMs);

    const currentCount = record.timestamps.length;
    const remaining = Math.max(0, this.maxRequests - currentCount - 1);
    const resetTimeSeconds = Math.ceil(this.windowMs / 1000);

    if (res && res.setHeader) {
      res.setHeader('X-RateLimit-Limit', this.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', resetTimeSeconds.toString());
    }

    if (currentCount >= this.maxRequests) {
      if (res && res.setHeader) {
        res.setHeader('Retry-After', resetTimeSeconds.toString());
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many certificate verification requests. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.timestamps.push(now);
    return true;
  }
}
