import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { hashToken } from '../crypto/tokens.js';
import { RoleCode, computeEffectivePermissions } from '@csi/shared';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const token = this.extractToken(req);
      if (!token) {
        return next();
      }

      const tokenHash = hashToken(token);
      const session = await this.prisma.session.findUnique({
        where: { tokenHash },
        include: {
          user: {
            include: {
              roleAssignments: {
                where: {
                  OR: [{ termEnd: null }, { termEnd: { gte: new Date() } }],
                },
                include: { role: true },
              },
            },
          },
        },
      });

      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        return next();
      }

      const user = session.user;
      if (!user || user.status !== 'active') {
        return next();
      }

      const activeRoles = user.roleAssignments.map((ra) => ra.role.code as RoleCode);
      const roles: RoleCode[] = activeRoles.length > 0 ? activeRoles : [RoleCode.MEMBER];
      const permissions = Array.from(computeEffectivePermissions(roles));

      const reqWithAuth = req as Request & { user?: unknown; sessionId?: string };
      reqWithAuth.user = {
        id: user.id,
        email: user.email,
        full_name: user.name,
        status: user.status,
        enrollment_no: user.enrollmentNo,
        avatar_url: user.photo,
        roles,
        permissions,
      };
      reqWithAuth.sessionId = session.id;
    } catch {
      // Unhandled lookups leave req.user undefined; handled by DenyByDefaultGuard
    }
    next();
  }

  private extractToken(req: Request): string | null {
    if (req.cookies && req.cookies['csi_session']) {
      return req.cookies['csi_session'];
    }
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    return null;
  }
}
