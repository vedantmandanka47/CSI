import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DenyByDefaultGuard } from './deny-by-default.guard.js';
import { PermissionCode, RoleCode } from '@csi/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator.js';

describe('DenyByDefaultGuard (ARCH-05)', () => {
  let guard: DenyByDefaultGuard;
  let reflector: Reflector;
  let mockContext: ExecutionContext;
  let mockRequest: { user?: { id: string; roles?: RoleCode[] } };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new DenyByDefaultGuard(reflector);
    mockRequest = {};
    mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  });

  it('allows access when route is marked with @Public()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return true;
      return undefined;
    });

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('throws ForbiddenException when route has neither @Public nor permission decorator (ARCH-05 deny-by-default)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    try {
      guard.canActivate(mockContext);
    } catch (err: unknown) {
      const error = err as ForbiddenException;
      const res = error.getResponse() as Record<string, unknown>;
      expect(res.code).toBe('FORBIDDEN');
    }
  });

  it('throws UnauthorizedException when required permission exists but no user is attached to request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PERMISSION_KEY) return PermissionCode.ROSTER_MANAGE;
      return undefined;
    });

    mockRequest.user = undefined;

    expect(() => guard.canActivate(mockContext)).toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException when authenticated user lacks the required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PERMISSION_KEY) return PermissionCode.SETTINGS_EDIT;
      return undefined;
    });

    mockRequest.user = { id: 'user-1', roles: [RoleCode.MEMBER] };

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  it('allows access when authenticated user possesses a role granting the required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PERMISSION_KEY) return PermissionCode.SETTINGS_EDIT;
      return undefined;
    });

    mockRequest.user = { id: 'admin-1', roles: [RoleCode.ADMIN] };

    expect(guard.canActivate(mockContext)).toBe(true);
  });
});

