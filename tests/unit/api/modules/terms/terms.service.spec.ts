import { Test, TestingModule } from '@nestjs/testing';
import { TermsService } from '../../../../../apps/api/src/modules/terms/terms.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TermStatus } from '@csi/shared';

describe('TermsService', () => {
  let service: TermsService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  const mockTerm = {
    id: 'term-uuid-1',
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
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      roleAssignment: {
        count: jest.fn().mockResolvedValue(5),
      },
      event: {
        count: jest.fn().mockResolvedValue(3),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TermsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TermsService>(TermsService);
  });

  describe('createTerm', () => {
    it('creates a new academic term with audit logging', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue(null);
      prisma.academicTerm.create.mockResolvedValue(mockTerm);

      const result = await service.createTerm('admin-uuid', {
        name: 'Academic Year 2026-2027',
        code: '2026-2027',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2027-06-30T23:59:59.000Z',
      });

      expect(result.id).toBe(mockTerm.id);
      expect(result.code).toBe(mockTerm.code);
      expect(prisma.academicTerm.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'term.created' }),
        }),
      );
    });

    it('rejects creation when startDate is greater than or equal to endDate', async () => {
      await expect(
        service.createTerm('admin-uuid', {
          name: 'Invalid Term',
          code: '2026-2027',
          startDate: '2027-08-01T00:00:00.000Z',
          endDate: '2026-06-30T23:59:59.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate term code with ConflictException', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue(mockTerm);

      await expect(
        service.createTerm('admin-uuid', {
          name: 'Academic Year 2026-2027 Duplicate',
          code: '2026-2027',
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2027-06-30T23:59:59.000Z',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getTerms', () => {
    it('lists terms and resolves the current term', async () => {
      const activeTerm = {
        ...mockTerm,
        id: 'term-active-1',
        status: TermStatus.ACTIVE,
        isCurrent: true,
      };
      prisma.academicTerm.findMany.mockResolvedValue([activeTerm, mockTerm]);

      const result = await service.getTerms();
      expect(result.data.length).toBe(2);
      expect(result.currentTerm?.id).toBe('term-active-1');
      expect(result.data[0]?.activeAppointmentsCount).toBe(5);
      expect(result.data[0]?.eventsCount).toBe(3);
    });
  });

  describe('getTermById', () => {
    it('returns term with activity counts', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue(mockTerm);

      const result = await service.getTermById(mockTerm.id);
      expect(result.id).toBe(mockTerm.id);
      expect(result.activeAppointmentsCount).toBe(5);
      expect(result.eventsCount).toBe(3);
    });

    it('throws NotFoundException if term does not exist', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue(null);

      await expect(service.getTermById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateTerm', () => {
    it('updates term details and logs audit entry', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue(mockTerm);
      prisma.academicTerm.update.mockResolvedValue({
        ...mockTerm,
        name: 'Renamed Academic Year 2026-2027',
      });

      const result = await service.updateTerm('admin-uuid', mockTerm.id, {
        name: 'Renamed Academic Year 2026-2027',
      });

      expect(result.name).toBe('Renamed Academic Year 2026-2027');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'term.updated' }),
        }),
      );
    });

    it('throws NotFoundException if updating nonexistent term', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTerm('admin-uuid', 'nonexistent', { name: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteTerm', () => {
    it('deletes draft term and logs audit entry', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue(mockTerm);
      prisma.academicTerm.delete.mockResolvedValue(mockTerm);

      const result = await service.deleteTerm('admin-uuid', mockTerm.id);
      expect(result.success).toBe(true);
      expect(prisma.academicTerm.delete).toHaveBeenCalledWith({
        where: { id: mockTerm.id },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'term.deleted' }),
        }),
      );
    });

    it('prevents deleting an active or current term', async () => {
      prisma.academicTerm.findUnique.mockResolvedValue({
        ...mockTerm,
        status: TermStatus.ACTIVE,
        isCurrent: true,
      });

      await expect(
        service.deleteTerm('admin-uuid', mockTerm.id),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
