import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionCode, hasPermission, RoleCode } from '@csi/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator.js';

@Injectable()
export class DenyByDefaultGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermission = this.reflector.getAllAndOverride<PermissionCode>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // ARCH-05: Deny by default. If neither @Public nor @RequirePermission is present, reject immediately.
    if (!requiredPermission) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message:
          'Access denied: Route is not explicitly configured with permissions or marked public',
      });
    }

    // In authenticated contexts, request.user will carry roles (computed per request per ARCH-06)
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.roles) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required for this operation',
      });
    }

    const roles: RoleCode[] = user.roles;
    if (!hasPermission(roles, requiredPermission)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Missing required permission: ${requiredPermission}`,
      });
    }

    return true;
  }
}
