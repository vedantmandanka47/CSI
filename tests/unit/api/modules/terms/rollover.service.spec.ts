import { Test, TestingModule } from '@nestjs/testing';
import { RolloverService } from '../../../../../apps/api/src/modules/terms/rollover.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TermStatus, UserStatus, RoleCode } from '@csi/shared';

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
        findUnique: jest.fn(),
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
  });

  describe('executeRollover', () => {
    it('rejects execution when confirmation code is invalid', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue(mockToTerm);

      await expect(
        service.executeRollover('admin-uuid', {
          toTermId: mockToTerm.id,
          confirmationCode: 'BAD_CODE',
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
      prisma.user.findUnique.mockResolvedValue({
        id: studentId,
        name: 'Incoming President',
        status: UserStatus.ACTIVE,
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
