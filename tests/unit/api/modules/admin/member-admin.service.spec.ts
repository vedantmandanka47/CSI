import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { MemberAdminService } from '../../../../../apps/api/src/modules/admin/members/member-admin.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { UserStatus, RoleCode } from '@csi/shared';

describe('MemberAdminService (M8)', () => {
  let service: MemberAdminService;
  let mockPrisma: {
    user: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    rosterEntry: {
      findMany: jest.Mock;
    };
    role: {
      findUnique: jest.Mock;
    };
    roleAssignment: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      rosterEntry: {
        findMany: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
      roleAssignment: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberAdminService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MemberAdminService>(MemberAdminService);
  });

  describe('listApplications', () => {
    it('returns paginated applications with roster match flags', async () => {
      const mockUsers = [
        {
          id: 'u1',
          name: 'Jane Doe',
          email: 'jane@gcet.edu.in',
          enrollmentNo: '23CS101',
          phone: '9876543210',
          branch: 'CSE',
          year: 2,
          status: UserStatus.PENDING,
          createdAt: new Date('2026-08-01T10:00:00Z'),
          updatedAt: new Date('2026-08-01T10:00:00Z'),
        },
        {
          id: 'u2',
          name: 'John Smith',
          email: 'john@gcet.edu.in',
          enrollmentNo: '23IT102',
          phone: '9876543211',
          branch: 'IT',
          year: 2,
          status: UserStatus.PENDING,
          createdAt: new Date('2026-08-01T11:00:00Z'),
          updatedAt: new Date('2026-08-01T11:00:00Z'),
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.rosterEntry.findMany.mockResolvedValue([{ enrollmentNo: '23CS101' }]);

      const result = await service.listApplications({
        page: 1,
        per_page: 20,
        status: UserStatus.PENDING,
      });

      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.id).toBe('u1');
      expect(result.data[0]!.is_on_roster).toBe(true);
      expect(result.data[1]!.id).toBe('u2');
      expect(result.data[1]!.is_on_roster).toBe(false);
      expect(result.meta.total).toBe(2);
    });
  });

  describe('approveApplication', () => {
    it('approves a pending application, assigns member role, and creates audit log', async () => {
      const pendingUser = {
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@gcet.edu.in',
        enrollmentNo: '23CS101',
        phone: '9876543210',
        branch: 'CSE',
        year: 2,
        status: UserStatus.PENDING,
        createdAt: new Date('2026-08-01T10:00:00Z'),
        updatedAt: new Date('2026-08-01T10:00:00Z'),
      };

      const updatedUser = {
        ...pendingUser,
        status: UserStatus.ACTIVE,
        updatedAt: new Date('2026-08-01T12:00:00Z'),
      };

      mockPrisma.user.findUnique.mockResolvedValue(pendingUser);
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-member', code: RoleCode.MEMBER });
      mockPrisma.roleAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.roleAssignment.create.mockResolvedValue({ id: 'ra-1' });
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await service.approveApplication('user-1', 'admin-1');

      expect(result.id).toBe('user-1');
      expect(result.status).toBe(UserStatus.ACTIVE);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: UserStatus.ACTIVE },
      });
      expect(mockPrisma.roleAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            roleId: 'role-member',
          }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'MEMBER_APPLICATION_APPROVED',
            actorId: 'admin-1',
            targetId: 'user-1',
          }),
        }),
      );
    });

    it('throws NotFoundException if user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.approveApplication('non-existent', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException if user status is already active', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
      });

      await expect(service.approveApplication('user-1', 'admin-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('rejectApplication', () => {
    it('deactivates user and creates audit log with reason', async () => {
      const pendingUser = {
        id: 'user-1',
        name: 'Jane Doe',
        email: 'jane@gcet.edu.in',
        enrollmentNo: '23CS101',
        phone: '9876543210',
        branch: 'CSE',
        year: 2,
        status: UserStatus.PENDING,
        createdAt: new Date('2026-08-01T10:00:00Z'),
        updatedAt: new Date('2026-08-01T10:00:00Z'),
      };

      const updatedUser = {
        ...pendingUser,
        status: UserStatus.INACTIVE,
        updatedAt: new Date('2026-08-01T12:00:00Z'),
      };

      mockPrisma.user.findUnique.mockResolvedValue(pendingUser);
      mockPrisma.user.update.mockResolvedValue(updatedUser);
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-2' });

      const result = await service.rejectApplication('user-1', 'Invalid enrollment number', 'admin-1');

      expect(result.id).toBe('user-1');
      expect(result.status).toBe(UserStatus.INACTIVE);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { status: UserStatus.INACTIVE },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'MEMBER_APPLICATION_REJECTED',
            actorId: 'admin-1',
            targetId: 'user-1',
            afterJson: expect.objectContaining({
              reason: 'Invalid enrollment number',
            }),
          }),
        }),
      );
    });

    it('throws BadRequestException if user is not in pending status', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.ACTIVE,
      });

      await expect(
        service.rejectApplication('user-1', 'Not eligible', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
