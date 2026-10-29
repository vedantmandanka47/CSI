import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfGuard } from './csrf.guard.js';
import { Request } from 'express';

describe('CsrfGuard (ARCH-14, SEC-04)', () => {
  let guard: CsrfGuard;
  let reflector: Reflector;
  let mockRequest: Partial<Request>;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new CsrfGuard(reflector);
    mockRequest = {
      method: 'GET',
      headers: {},
      cookies: {},
    };
    mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  });

  it('allows safe HTTP methods (GET, HEAD, OPTIONS) unconditionally', () => {
    mockRequest.method = 'GET';
    expect(guard.canActivate(mockContext)).toBe(true);

    mockRequest.method = 'HEAD';
    expect(guard.canActivate(mockContext)).toBe(true);

    mockRequest.method = 'OPTIONS';
    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('allows mutating requests if route is marked as @Public or @ExemptCsrf', () => {
    mockRequest.method = 'POST';
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('throws ForbiddenException (CSRF_INVALID) on POST when cookies or header are missing', () => {
    mockRequest.method = 'POST';
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    try {
      guard.canActivate(mockContext);
    } catch (err: unknown) {
      const res = (err as ForbiddenException).getResponse() as Record<string, unknown>;
      expect(res.code).toBe('CSRF_INVALID');
    }
  });

  it('throws ForbiddenException when header token does not match csi_csrf cookie', () => {
    mockRequest.method = 'POST';
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    mockRequest.cookies = { csi_csrf: 'token-abc' };
    mockRequest.headers = { 'x-csrf-token': 'token-wrong' };

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  it('allows POST when x-csrf-token header matches csi_csrf cookie', () => {
    mockRequest.method = 'POST';
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    mockRequest.cookies = { csi_csrf: 'valid-secret-123' };
    mockRequest.headers = { 'x-csrf-token': 'valid-secret-123' };

    expect(guard.canActivate(mockContext)).toBe(true);
  });
});
