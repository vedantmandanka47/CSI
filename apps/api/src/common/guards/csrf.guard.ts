import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
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

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Public auth endpoints (e.g. login, register, forgot password) are exempt if marked as such
    if (isExempt || isPublic) {
      return true;
    }

    // Mutating state operations require double-submit cookie verification (ARCH-14, SEC-04)
    const csrfCookie = request.cookies?.['csi_csrf'];
    const csrfHeader = (request.headers['x-csrf-token'] as string) || (request.headers['x-xsrf-token'] as string);

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      throw new ForbiddenException({
        code: 'CSRF_INVALID',
        message: 'Invalid or missing CSRF token',
      });
    }

    return true;
  }
}
