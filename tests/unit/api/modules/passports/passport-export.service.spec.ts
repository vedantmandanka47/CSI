import { Test, TestingModule } from '@nestjs/testing';
import { PassportExportService } from '../../../../../apps/api/src/modules/passports/services/passport-export.service.js';
import { PassportAggregationService } from '../../../../../apps/api/src/modules/passports/services/passport-aggregation.service.js';
import { PassportPdfService } from '../../../../../apps/api/src/modules/passports/services/passport-pdf.service.js';
import { PassportStorageService } from '../../../../../apps/api/src/modules/passports/services/passport-storage.service.js';
import { VerificationCodeService } from '../../../../../apps/api/src/modules/certificates/verification/verification-code.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { CurrentUser, PermissionCode, ErrorCode } from '@csi/shared';
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';

describe('PassportExportService', () => {
  let service: PassportExportService;

  const mockPrisma = {
    passport: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockAggregationService = {
    getStudentPassport: jest.fn(),
  };

  const mockPdfService = {
    generatePassportPdf: jest.fn(),
  };

  const mockStorageService = {
    savePassportPdf: jest.fn(),
    hasPassportPdf: jest.fn(),
    getPassportPdf: jest.fn(),
    verifyFileIntegrity: jest.fn(),
  };

  const mockVerificationCodeService = {
    generateVerificationCode: jest.fn(),
    formatVerificationCode: jest.fn(),
    hashVerificationCode: jest.fn(),
  };

  const mockStudentUser: CurrentUser = {
    id: 'student-id-1',
    full_name: 'Ananya Sharma',
    email: 'ananya@gcet.ac.in',
    status: 'active',
    roles: ['member'],
    permissions: [PermissionCode.SELF_DASHBOARD],
  };

  const mockAdminUser: CurrentUser = {
    id: 'admin-id-1',
    full_name: 'Admin User',
    email: 'admin@gcet.ac.in',
    status: 'active',
    roles: ['admin'],
    permissions: [PermissionCode.EXPORT_DATA],
  };

  const mockIntruderUser: CurrentUser = {
    id: 'intruder-id-1',
    full_name: 'Intruder User',
    email: 'intruder@gcet.ac.in',
    status: 'active',
    roles: ['member'],
    permissions: [PermissionCode.SELF_DASHBOARD],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAggregationService.getStudentPassport.mockResolvedValue({
      student: { id: 'student-id-1', name: 'Ananya Sharma' },
      summary: { eventsAttended: 1, certificatesEarned: 1, committeeTenures: 0, totalActivities: 2 },
      activities: [],
    });

    mockPdfService.generatePassportPdf.mockResolvedValue({
      pdfBuffer: Buffer.from('%PDF-dummy-bytes'),
      fileHash: 'sha256hash123',
    });

    mockStorageService.savePassportPdf.mockResolvedValue({
      storagePath: 'student-id-1.pdf',
      fileHash: 'sha256hash123',
      fileSizeBytes: 100,
    });
    mockStorageService.hasPassportPdf.mockReturnValue(true);
    mockStorageService.getPassportPdf.mockResolvedValue(Buffer.from('%PDF-dummy-bytes'));
    mockStorageService.verifyFileIntegrity.mockResolvedValue(true);

    mockVerificationCodeService.generateVerificationCode.mockReturnValue('47XQ9M2KW8TR5VNP');
    mockVerificationCodeService.formatVerificationCode.mockReturnValue('47XQ-9M2K-W8TR-5VNP');
    mockVerificationCodeService.hashVerificationCode.mockReturnValue('codehash123');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PassportExportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PassportAggregationService, useValue: mockAggregationService },
        { provide: PassportPdfService, useValue: mockPdfService },
        { provide: PassportStorageService, useValue: mockStorageService },
        { provide: VerificationCodeService, useValue: mockVerificationCodeService },
      ],
    }).compile();

    service = module.get<PassportExportService>(PassportExportService);
  });

  describe('exportPassport', () => {
    it('allows student to export their own activity passport', async () => {
      mockPrisma.passport.create.mockResolvedValue({ id: 'p-new-1', passportNumber: 'CSI-PASS-2026-0001' });
      mockPrisma.passport.update.mockResolvedValue({});

      const res = await service.exportPassport('student-id-1', mockStudentUser);

      expect(res.pdfBuffer).toBeDefined();
      expect(res.filename).toContain('Ananya_Sharma');
      expect(mockPrisma.passport.create).toHaveBeenCalled();
    });

    it('allows administrator with EXPORT_DATA to export student passport', async () => {
      mockPrisma.passport.create.mockResolvedValue({ id: 'p-new-1', passportNumber: 'CSI-PASS-2026-0001' });
      mockPrisma.passport.update.mockResolvedValue({});

      const res = await service.exportPassport('student-id-1', mockAdminUser);

      expect(res.pdfBuffer).toBeDefined();
      expect(mockPrisma.passport.create).toHaveBeenCalled();
    });

    it('denies intruder student from exporting another student passport (IDOR)', async () => {
      await expect(
        service.exportPassport('student-id-1', mockIntruderUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPassportDownload', () => {
    it('throws NotFoundException when passport does not exist', async () => {
      mockPrisma.passport.findUnique.mockResolvedValue(null);

      await expect(
        service.getPassportDownload('missing-id', mockStudentUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('denies intruder user from downloading another student passport', async () => {
      mockPrisma.passport.findUnique.mockResolvedValue({
        id: 'p-1',
        userId: 'student-id-1',
        user: { id: 'student-id-1', name: 'Ananya Sharma' },
        storagePath: 'p-1.pdf',
        fileHash: 'sha256hash123',
      });

      await expect(
        service.getPassportDownload('p-1', mockIntruderUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException (PASSPORT_FILE_UNAVAILABLE) when file is missing from storage', async () => {
      mockPrisma.passport.findUnique.mockResolvedValue({
        id: 'p-1',
        userId: 'student-id-1',
        user: { id: 'student-id-1', name: 'Ananya Sharma' },
        storagePath: 'missing.pdf',
        fileHash: 'sha256hash123',
      });
      mockStorageService.hasPassportPdf.mockReturnValue(false);

      try {
        await service.getPassportDownload('p-1', mockStudentUser);
        fail('Expected ConflictException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ConflictException);
        const res = (err as ConflictException).getResponse() as { code: string };
        expect(res.code).toBe(ErrorCode.PASSPORT_FILE_UNAVAILABLE);
      }
    });

    it('throws ConflictException (PASSPORT_INTEGRITY_MISMATCH) when file integrity fails', async () => {
      mockPrisma.passport.findUnique.mockResolvedValue({
        id: 'p-1',
        userId: 'student-id-1',
        user: { id: 'student-id-1', name: 'Ananya Sharma' },
        storagePath: 'p-1.pdf',
        fileHash: 'expected-hash',
      });
      mockStorageService.hasPassportPdf.mockReturnValue(true);
      mockStorageService.verifyFileIntegrity.mockResolvedValue(false); // Tampered file

      try {
        await service.getPassportDownload('p-1', mockStudentUser);
        fail('Expected ConflictException');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ConflictException);
        const res = (err as ConflictException).getResponse() as { code: string };
        expect(res.code).toBe(ErrorCode.PASSPORT_INTEGRITY_MISMATCH);
      }
    });

    it('returns PDF buffer and filename when file is intact and authorized', async () => {
      mockPrisma.passport.findUnique.mockResolvedValue({
        id: 'p-1',
        userId: 'student-id-1',
        user: { id: 'student-id-1', name: 'Ananya Sharma' },
        storagePath: 'p-1.pdf',
        fileHash: 'expected-hash',
      });
      mockStorageService.hasPassportPdf.mockReturnValue(true);
      mockStorageService.verifyFileIntegrity.mockResolvedValue(true);

      const res = await service.getPassportDownload('p-1', mockStudentUser);

      expect(res.pdfBuffer).toBeDefined();
      expect(res.filename).toBe('passport-Ananya_Sharma.pdf');
    });
  });
});
