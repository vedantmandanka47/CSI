import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CSRF_EXEMPT_KEY } from '../decorators/csrf-exempt.decorator.js';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    // Safe HTTP methods do not mutate state and are exempted from CSRF checks
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    const isExempt = this.reflector.getAllAndOverride<boolean>(CSRF_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // AUD-SEC-02: Mutating operations are exempt ONLY if explicitly decorated with @ExemptCsrf() / @CsrfExempt().
    // Blanket @Public() metadata is deliberately NOT sufficient to bypass CSRF on mutating requests.
    if (isExempt) {
      return true;
    }

    // Mutating state operations require double-submit cookie verification (ARCH-14, SEC-04)
    const csrfCookie = request.cookies?.['csi_csrf'];
    const csrfHeader =
      (request.headers['x-csrf-token'] as string) ||
      (request.headers['x-xsrf-token'] as string);

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      throw new ForbiddenException({
        code: 'CSRF_INVALID',
        message: 'Invalid or missing CSRF token',
      });
    }

    return true;
  }
}
