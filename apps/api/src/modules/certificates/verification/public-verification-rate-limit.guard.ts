import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { RateLimiterService } from '../../../common/services/rate-limiter.service.js';

@Injectable()
export class PublicVerificationRateLimitGuard implements CanActivate {
  private readonly windowMs = 60 * 1000; // 1 minute window
  private readonly maxRequests = 30; // Max 30 requests per minute per IP

  constructor(private readonly rateLimiter: RateLimiterService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // SEC-28 & AUD-SEC-01: Trust Express req.ip (configured via trust proxy) over raw client-spoofed headers
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // AUD-ARCH-02: Delegate sliding window enforcement and headers to centralized RateLimiterService
    this.rateLimiter.assertLimitWithHeaders(
      `public-verification:${clientIp}`,
      this.maxRequests,
      this.windowMs,
      res,
      'Too many certificate verification requests. Please try again later.',
    );

    return true;
  }
}
