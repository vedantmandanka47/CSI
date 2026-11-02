import { AuthMiddleware } from '../../../../../apps/api/src/common/middleware/auth.middleware.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { Request, Response, NextFunction } from 'express';
import { RoleCode } from '@csi/shared';

describe('AuthMiddleware (ARCH-05, AUD-SEC-04)', () => {
  let middleware: AuthMiddleware;
  let mockPrisma: {
    session: {
      findUnique: jest.Mock;
    };
  };
  let mockReq: Partial<Request> & { user?: unknown; sessionId?: string };
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockPrisma = {
      session: {
        findUnique: jest.fn(),
      },
    };
    middleware = new AuthMiddleware(mockPrisma as unknown as PrismaService);
    mockReq = {
      headers: {},
      cookies: {},
    };
    mockRes = {};
    mockNext = jest.fn();
  });

  it('proceeds without attaching user when no token is present', async () => {
    await middleware.use(mockReq as Request, mockRes as Response, mockNext);
    expect(mockReq.user).toBeUndefined();
    expect(mockNext).toHaveBeenCalled();
  });

  it('attaches user identity and permissions for a valid active session cookie', async () => {
    mockReq.cookies = { csi_session: 'raw-test-session-token' };

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    mockPrisma.session.findUnique.mockResolvedValue({
      id: 'session-123',
      revokedAt: null,
      expiresAt: futureDate,
      user: {
        id: 'user-abc',
        email: 'member@gcet.edu.in',
        name: 'Test Member',
        status: 'active',
        enrollmentNo: '23CS001',
        photo: null,
        roleAssignments: [
          {
            role: { code: RoleCode.MEMBER },
          },
        ],
      },
    });

    await middleware.use(mockReq as Request, mockRes as Response, mockNext);

    expect(mockReq.user).toBeDefined();
    const user = mockReq.user as Record<string, unknown>;
    expect(user.id).toBe('user-abc');
    expect(user.email).toBe('member@gcet.edu.in');
    expect(mockReq.sessionId).toBe('session-123');
    expect(mockNext).toHaveBeenCalled();
  });

  it('logs warning and safely fails closed when database lookup throws an error (AUD-SEC-04)', async () => {
    mockReq.cookies = { csi_session: 'raw-test-session-token' };
    mockReq.headers = { 'x-request-id': 'req-test-fail-1' };

    mockPrisma.session.findUnique.mockRejectedValue(new Error('PostgreSQL connection timeout'));

    await middleware.use(mockReq as Request, mockRes as Response, mockNext);

    // Leaves req.user undefined; fail-closed
    expect(mockReq.user).toBeUndefined();
    expect(mockNext).toHaveBeenCalled();
  });
});
