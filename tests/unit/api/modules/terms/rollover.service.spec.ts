import { Test, TestingModule } from '@nestjs/testing';
import { RolloverService } from '../../../../../apps/api/src/modules/terms/rollover.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  TermStatus,
  UserStatus,
  RoleCode,
  PermissionCode,
  CurrentUser,
  ErrorCode,
} from '@csi/shared';
import { hashPassword } from '../../../../../apps/api/src/common/crypto/tokens.js';

describe('RolloverService', () => {
  let service: RolloverService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const mockFromTerm = {
    id: 'from-term-id',
    name: 'Academic Year 2025-2026',
    code: '2025-2026',
    startDate: new Date('2025-08-01T00:00:00Z'),
    endDate: new Date('2026-06-30T23:59:59Z'),
    status: TermStatus.ACTIVE,
    isCurrent: true,
    archivedAt: null,
    createdById: 'admin-uuid',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockToTerm = {
    id: 'to-term-id',
    name: 'Academic Year 2026-2027',
    code: '2026-2027',
    startDate: new Date('2026-08-01T00:00:00Z'),
    endDate: new Date('2027-06-30T23:59:59Z'),
    status: TermStatus.DRAFT,
    isCurrent: false,
    archivedAt: null,
    createdById: 'admin-uuid',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminPassword = 'AdminPassword123!';
  let mockAdminPasswordHash: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAdminUser: any;

  beforeAll(async () => {
    mockAdminPasswordHash = await hashPassword(mockAdminPassword);
    mockAdminUser = {
      id: 'admin-uuid',
      name: 'Admin User',
      email: 'admin@gcet.edu.in',
      passwordHash: mockAdminPasswordHash,
      status: UserStatus.ACTIVE,
      roleAssignments: [
        {
          id: 'ra-admin-1',
          userId: 'admin-uuid',
          roleId: 'role-admin',
          role: { id: 'role-admin', code: RoleCode.ADMIN, name: 'Admin' },
          termEnd: null,
        },
      ],
    };
  });

  beforeEach(async () => {
    prisma = {
      academicTerm: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      roleAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 4 }),
        create: jest.fn().mockResolvedValue({ id: 'new-ra-1' }),
      },
      user: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === 'admin-uuid') return Promise.resolve(mockAdminUser);
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        count: jest.fn().mockResolvedValue(10),
      },
      role: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: 'role-admin' }, { id: 'role-faculty' }]),
      },
      committee: {
        findUnique: jest.fn(),
      },
      rosterEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      task: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        count: jest.fn().mockResolvedValue(10),
      },
      checklistRun: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(5),
      },
      committeeAsset: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(8),
      },
      event: {
        count: jest.fn().mockResolvedValue(12),
      },
      attendanceRecord: {
        count: jest.fn().mockResolvedValue(150),
      },
      certificate: {
        count: jest.fn().mockResolvedValue(120),
      },
      passport: {
        count: jest.fn().mockResolvedValue(45),
      },
      termSnapshot: {
        create: jest.fn().mockResolvedValue({ id: 'snapshot-uuid-1' }),
        findFirst: jest.fn(),
      },
      termRollover: {
        create: jest.fn().mockResolvedValue({ id: 'rollover-uuid-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-uuid-1' }),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolloverService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<RolloverService>(RolloverService);
  });

  describe('generatePreview', () => {
    it('generates a rollover preview identifying outgoing roles and unresolved tasks', async () => {
      prisma.academicTerm.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) => {
        if (where.id === mockToTerm.id) return Promise.resolve(mockToTerm);
        if (where.id === mockFromTerm.id) return Promise.resolve(mockFromTerm);
        return Promise.resolve(null);
      });
      prisma.academicTerm.findFirst.mockResolvedValue(mockFromTerm);

      const preview = await service.generatePreview({
        toTermId: mockToTerm.id,
        archiveOpenTasks: true,
        transitionGraduatingMembers: true,
        incomingAppointments: [],
      });

      expect(preview.toTerm.id).toBe(mockToTerm.id);
      expect(preview.fromTerm?.id).toBe(mockFromTerm.id);
      expect(preview.canExecute).toBe(true);
      expect(preview.suggestedConfirmationCode).toBe('CONFIRM_ROLLOVER_2026-2027');
    });

    it('rejects preview when target term does not exist', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue(null);

      await expect(
        service.generatePreview({
          toTermId: 'nonexistent-uuid',
          archiveOpenTasks: true,
          transitionGraduatingMembers: true,
          incomingAppointments: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects preview when source and target terms are identical', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue(mockFromTerm);
      prisma.academicTerm.findFirst.mockResolvedValue(mockFromTerm);

      await expect(
        service.generatePreview({
          fromTermId: mockFromTerm.id,
          toTermId: mockFromTerm.id,
          archiveOpenTasks: true,
          transitionGraduatingMembers: true,
          incomingAppointments: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('flags duplicate appointments in incomingAppointmentsValidation', async () => {
      prisma.academicTerm.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) => {
        if (where.id === mockToTerm.id) return Promise.resolve(mockToTerm);
        return Promise.resolve(null);
      });
      prisma.academicTerm.findFirst.mockResolvedValue(mockFromTerm);

      const userId = '11111111-1111-1111-1111-111111111111';
      prisma.user.findUnique.mockResolvedValue({
        id: userId,
        name: 'Test Student',
        status: UserStatus.ACTIVE,
      });
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-pres-id',
        code: RoleCode.PRESIDENT,
        name: 'President',
      });

      const preview = await service.generatePreview({
        toTermId: mockToTerm.id,
        incomingAppointments: [
          { userId, roleCode: RoleCode.PRESIDENT },
          { userId, roleCode: RoleCode.PRESIDENT }, // duplicate
        ],
        archiveOpenTasks: true,
        transitionGraduatingMembers: true,
      });

      expect(preview.canExecute).toBe(false);
      expect(preview.blockingReasons.length).toBeGreaterThan(0);
      expect(preview.incomingAppointmentsValidation[1]?.isValid).toBe(false);
    });

    it('blocks non-admin executive from appointing ADMIN role during preview', async () => {
      prisma.academicTerm.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === mockToTerm.id) return Promise.resolve(mockToTerm);
          return Promise.resolve(null);
        },
      );
      prisma.academicTerm.findFirst.mockResolvedValue(mockFromTerm);

      const studentId = '33333333-3333-3333-3333-333333333333';
      prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === studentId) {
          return Promise.resolve({
            id: studentId,
            name: 'Proposed Admin',
            status: UserStatus.ACTIVE,
          });
        }
        return Promise.resolve(null);
      });
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-admin-id',
        code: RoleCode.ADMIN,
        name: 'Administrator',
      });

      const presidentCaller: CurrentUser = {
        id: 'pres-uuid',
        email: 'president@gcet.edu.in',
        full_name: 'Branch President',
        status: UserStatus.ACTIVE,
        roles: [RoleCode.PRESIDENT],
        permissions: [PermissionCode.ROSTER_MANAGE],
      };

      const preview = await service.generatePreview(
        {
          toTermId: mockToTerm.id,
          incomingAppointments: [{ userId: studentId, roleCode: RoleCode.ADMIN }],
          archiveOpenTasks: true,
          transitionGraduatingMembers: true,
        },
        presidentCaller,
      );

      expect(preview.canExecute).toBe(false);
      expect(preview.blockingReasons).toContain(
        'Privilege escalation blocked: only administrators can appoint the ADMIN role',
      );
      expect(preview.incomingAppointmentsValidation[0]?.isValid).toBe(false);
      expect(preview.incomingAppointmentsValidation[0]?.error).toBe(
        'Privilege escalation blocked: only administrators can appoint the ADMIN role',
      );
    });

    it('allows admin caller to appoint ADMIN role during preview', async () => {
      prisma.academicTerm.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) => {
          if (where.id === mockToTerm.id) return Promise.resolve(mockToTerm);
          return Promise.resolve(null);
        },
      );
      prisma.academicTerm.findFirst.mockResolvedValue(mockFromTerm);

      const studentId = '33333333-3333-3333-3333-333333333333';
      prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === studentId) {
          return Promise.resolve({
            id: studentId,
            name: 'Proposed Admin',
            status: UserStatus.ACTIVE,
          });
        }
        return Promise.resolve(null);
      });
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-admin-id',
        code: RoleCode.ADMIN,
        name: 'Administrator',
      });

      const adminCaller: CurrentUser = {
        id: 'admin-uuid',
        email: 'admin@gcet.edu.in',
        full_name: 'System Administrator',
        status: UserStatus.ACTIVE,
        roles: [RoleCode.ADMIN],
        permissions: [PermissionCode.ROLE_GRANT_ADMIN],
      };

      const preview = await service.generatePreview(
        {
          toTermId: mockToTerm.id,
          incomingAppointments: [{ userId: studentId, roleCode: RoleCode.ADMIN }],
          archiveOpenTasks: true,
          transitionGraduatingMembers: true,
        },
        adminCaller,
      );

      expect(preview.canExecute).toBe(true);
      expect(preview.blockingReasons).toHaveLength(0);
      expect(preview.incomingAppointmentsValidation[0]?.isValid).toBe(true);
    });
  });

  describe('executeRollover', () => {
    it('rejects execution when password confirmation is missing (REAUTH_REQUIRED)', async () => {
      try {
        await service.executeRollover('admin-uuid', {
          toTermId: mockToTerm.id,
          confirmationCode: 'CONFIRM_ROLLOVER_2026-2027',
          archiveOpenTasks: true,
          transitionGraduatingMembers: true,
          incomingAppointments: [],
        });
        fail('Should have thrown BadRequestException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: ErrorCode.REAUTH_REQUIRED,
        });
      }
    });

    it('rejects execution when password confirmation is invalid (REAUTH_FAILED)', async () => {
      try {
        await service.executeRollover('admin-uuid', {
          toTermId: mockToTerm.id,
          confirmationCode: 'CONFIRM_ROLLOVER_2026-2027',
          password: 'WrongPassword123!',
          archiveOpenTasks: true,
          transitionGraduatingMembers: true,
          incomingAppointments: [],
        });
        fail('Should have thrown UnauthorizedException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        expect((err as UnauthorizedException).getResponse()).toMatchObject({
          code: ErrorCode.REAUTH_FAILED,
        });
      }
    });

    it('blocks non-admin executive from appointing ADMIN role (ROLLOVER_UNAUTHORIZED_ROLE_GRANT)', async () => {
      const presUser = {
        id: 'pres-uuid',
        name: 'President User',
        email: 'pres@gcet.edu.in',
        passwordHash: mockAdminPasswordHash,
        status: UserStatus.ACTIVE,
        roleAssignments: [
          {
            id: 'ra-pres-1',
            userId: 'pres-uuid',
            roleId: 'role-pres-id',
            role: { id: 'role-pres-id', code: RoleCode.PRESIDENT, name: 'President' },
            termEnd: null,
          },
        ],
      };

      prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 'pres-uuid') return Promise.resolve(presUser);
        return Promise.resolve(null);
      });

      try {
        await service.executeRollover('pres-uuid', {
          toTermId: mockToTerm.id,
          confirmationCode: 'CONFIRM_ROLLOVER_2026-2027',
          password: mockAdminPassword,
          archiveOpenTasks: true,
          transitionGraduatingMembers: true,
          incomingAppointments: [
            {
              userId: '44444444-4444-4444-4444-444444444444',
              roleCode: RoleCode.ADMIN,
            },
          ],
        });
        fail('Should have thrown ForbiddenException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).getResponse()).toMatchObject({
          code: ErrorCode.ROLLOVER_UNAUTHORIZED_ROLE_GRANT,
        });
      }
    });

    it('rejects execution when confirmation code is invalid', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue(mockToTerm);

      await expect(
        service.executeRollover('admin-uuid', {
          toTermId: mockToTerm.id,
          confirmationCode: 'BAD_CODE',
          password: mockAdminPassword,
          archiveOpenTasks: true,
          transitionGraduatingMembers: true,
          incomingAppointments: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('executes rollover transactionally, seating new board, closing previous roles, and creating snapshot', async () => {
      prisma.academicTerm.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) => {
        if (where.id === mockToTerm.id) return Promise.resolve(mockToTerm);
        if (where.id === mockFromTerm.id) return Promise.resolve(mockFromTerm);
        return Promise.resolve(null);
      });
      prisma.academicTerm.findFirst.mockResolvedValue(mockFromTerm);

      const studentId = '22222222-2222-2222-2222-222222222222';
      prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === 'admin-uuid') return Promise.resolve(mockAdminUser);
        if (where.id === studentId) {
          return Promise.resolve({
            id: studentId,
            name: 'Incoming President',
            status: UserStatus.ACTIVE,
          });
        }
        return Promise.resolve(null);
      });
      prisma.role.findUnique.mockResolvedValue({
        id: 'role-pres-id',
        code: RoleCode.PRESIDENT,
        name: 'President',
      });

      const res = await service.executeRollover('admin-uuid', {
        fromTermId: mockFromTerm.id,
        toTermId: mockToTerm.id,
        confirmationCode: 'CONFIRM_ROLLOVER_2026-2027',
        password: mockAdminPassword,
        archiveOpenTasks: true,
        transitionGraduatingMembers: true,
        notes: 'Annual rollover executed for academic year 2026-2027',
        incomingAppointments: [
          {
            userId: studentId,
            roleCode: RoleCode.PRESIDENT,
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.summary.toTermCode).toBe(mockToTerm.code);
      expect(res.summary.incomingRolesCreatedCount).toBe(1);
      expect(prisma.roleAssignment.updateMany).toHaveBeenCalled();
      expect(prisma.academicTerm.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockToTerm.id },
          data: expect.objectContaining({ status: TermStatus.ACTIVE, isCurrent: true }),
        }),
      );
      expect(prisma.termSnapshot.create).toHaveBeenCalled();
      expect(prisma.termRollover.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'term.rollover_executed' }),
        }),
      );
    });

    it('rejects execution when target term is already archived', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue({
        ...mockToTerm,
        status: TermStatus.ARCHIVED,
      });

      await expect(
        service.executeRollover('admin-uuid', {
          toTermId: mockToTerm.id,
          confirmationCode: 'CONFIRM_ROLLOVER_2026-2027',
          password: mockAdminPassword,
          archiveOpenTasks: true,
          transitionGraduatingMembers: true,
          incomingAppointments: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects execution when outgoing term is already archived', async () => {
      prisma.academicTerm.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) => {
        if (where.id === mockToTerm.id) return Promise.resolve(mockToTerm);
        if (where.id === mockFromTerm.id)
          return Promise.resolve({ ...mockFromTerm, status: TermStatus.ARCHIVED });
        return Promise.resolve(null);
      });

      await expect(
        service.executeRollover('admin-uuid', {
          fromTermId: mockFromTerm.id,
          toTermId: mockToTerm.id,
          confirmationCode: 'CONFIRM_ROLLOVER_2026-2027',
          password: mockAdminPassword,
          archiveOpenTasks: true,
          transitionGraduatingMembers: true,
          incomingAppointments: [],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getTermSnapshot', () => {
    it('returns the captured snapshot for a term', async () => {
      prisma.termSnapshot.findFirst.mockResolvedValue({
        id: 'snap-1',
        termId: mockFromTerm.id,
        termCode: mockFromTerm.code,
        termName: mockFromTerm.name,
        capturedAt: new Date(),
        capturedById: 'admin-uuid',
        capturedBy: { name: 'Admin User' },
        snapshotJson: {
          metrics: {
            totalEvents: 10,
            totalAttendance: 100,
            totalCertificatesIssued: 90,
            totalPassportsGenerated: 20,
            totalTasksCompleted: 15,
            totalTasksArchived: 2,
            totalChecklistsSignedOff: 4,
            totalAssetsApproved: 6,
            activeMembersCount: 25,
          },
          rosterSnapshot: [],
        },
      });

      const res = await service.getTermSnapshot(mockFromTerm.id);
      expect(res.termCode).toBe(mockFromTerm.code);
      expect(res.metrics.totalEvents).toBe(10);
      expect(res.capturedByName).toBe('Admin User');
    });

    it('throws NotFoundException if snapshot does not exist', async () => {
      prisma.termSnapshot.findFirst.mockResolvedValue(null);

      await expect(service.getTermSnapshot('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
