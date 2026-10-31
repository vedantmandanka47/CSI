import { HttpException, HttpStatus } from '@nestjs/common';
import { RateLimiterService } from '../../../../../apps/api/src/common/services/rate-limiter.service.js';

describe('RateLimiterService (SEC-05, SEC-06)', () => {
  let service: RateLimiterService;

  beforeEach(() => {
    service = new RateLimiterService();
  });

  it('allows requests within threshold', () => {
    expect(() => {
      service.assertLimit('test-key', 3, 10000);
      service.assertLimit('test-key', 3, 10000);
      service.assertLimit('test-key', 3, 10000);
    }).not.toThrow();
  });

  it('throws 429 TOO_MANY_REQUESTS when limit is exceeded', () => {
    service.assertLimit('ip-1', 2, 10000);
    service.assertLimit('ip-1', 2, 10000);

    expect(() => service.assertLimit('ip-1', 2, 10000)).toThrow(HttpException);
    try {
      service.assertLimit('ip-1', 2, 10000);
    } catch (err: unknown) {
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const res = httpErr.getResponse() as Record<string, unknown>;
      expect(res.error).toEqual({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      });
    }
  });

  it('resets limit on command', () => {
    service.assertLimit('ip-reset', 1, 10000);
    expect(() => service.assertLimit('ip-reset', 1, 10000)).toThrow(HttpException);

    service.reset('ip-reset');
    expect(() => service.assertLimit('ip-reset', 1, 10000)).not.toThrow();
  });
});
