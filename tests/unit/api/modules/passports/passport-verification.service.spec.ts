import { Test, TestingModule } from '@nestjs/testing';
import { PassportVerificationService } from '../../../../../apps/api/src/modules/passports/services/passport-verification.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { VerificationCodeService } from '../../../../../apps/api/src/modules/certificates/verification/verification-code.service.js';
import { PassportStorageService } from '../../../../../apps/api/src/modules/passports/services/passport-storage.service.js';
import { VerificationOutcome } from '@csi/shared';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('PassportVerificationService', () => {
  let service: PassportVerificationService;
  let verificationCodeService: VerificationCodeService;

  const mockPrisma = {
    passport: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn((promises: Promise<unknown>[]) => Promise.all(promises)),
  };

  const mockStorageService = {
    verifyFileIntegrity: jest.fn(),
  };

  const validFormattedCode = '47XQ-9M2K-W8TR-5VNP';
  const validCodeHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const mockPassportRecord = {
    id: 'passport-uuid-1',
    userId: 'user-uuid-1',
    passportNumber: 'CSI-PASS-2026-A1B2',
    status: 'active',
    fileHash: 'filehash1234567890abcdef',
    storagePath: 'passport-uuid-1.pdf',
    verificationCodeHash: validCodeHash,
    summaryJson: {
      eventsAttended: 3,
      certificatesEarned: 2,
      committeeTenures: 1,
      totalActivities: 6,
    },
    generatedAt: new Date('2026-10-25T12:00:00Z'),
    revokedAt: null,
    revocationReason: null,
    user: {
      name: 'Ananya Sharma',
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    verificationCodeService = new VerificationCodeService();
    // Pre-calculate hash for test code
    jest.spyOn(verificationCodeService, 'hashVerificationCode').mockReturnValue(validCodeHash);

    mockStorageService.verifyFileIntegrity.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PassportVerificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: VerificationCodeService, useValue: verificationCodeService },
        { provide: PassportStorageService, useValue: mockStorageService },
      ],
    }).compile();

    service = module.get<PassportVerificationService>(PassportVerificationService);
  });

  describe('verifyPassport', () => {
    it('returns INVALID for malformed verification code format', async () => {
      const res = await service.verifyPassport('short');
      expect(res.status).toBe(VerificationOutcome.INVALID);
      expect(res.isAuthentic).toBe(false);
    });

    it('returns NOT_FOUND when no passport matches code hash', async () => {
      mockPrisma.passport.findUnique.mockResolvedValue(null);

      const res = await service.verifyPassport(validFormattedCode);
      expect(res.status).toBe(VerificationOutcome.NOT_FOUND);
      expect(res.isAuthentic).toBe(false);
    });

    it('returns VALID and minimal privacy-preserving fields for authentic passport', async () => {
      mockPrisma.passport.findUnique.mockResolvedValue(mockPassportRecord);

      const res = await service.verifyPassport(validFormattedCode);

      expect(res.status).toBe(VerificationOutcome.VALID);
      expect(res.isAuthentic).toBe(true);
      expect(res.credentialType).toBe('passport');
      expect(res.passportNumber).toBe('CSI-PASS-2026-A1B2');
      expect(res.studentName).toBe('Ananya Sharma');
      expect(res.summaryCounts?.eventsAttended).toBe(3);
      expect(res.summaryCounts?.certificatesEarned).toBe(2);

      // Verify privacy preservation: NO email, phone, enrollmentNo, or database UUIDs
      const anyRes = res as Record<string, unknown>;
      expect(anyRes['email']).toBeUndefined();
      expect(anyRes['phone']).toBeUndefined();
      expect(anyRes['enrollmentNo']).toBeUndefined();
      expect(anyRes['id']).toBeUndefined();
      expect(anyRes['storagePath']).toBeUndefined();
    });

    it('returns REVOKED with revocation details when passport was revoked', async () => {
      mockPrisma.passport.findUnique.mockResolvedValue({
        ...mockPassportRecord,
        status: 'revoked',
        revokedAt: new Date('2026-10-30T10:00:00Z'),
        revocationReason: 'Academic disciplinary action.',
      });

      const res = await service.verifyPassport(validFormattedCode);

      expect(res.status).toBe(VerificationOutcome.REVOKED);
      expect(res.isAuthentic).toBe(false);
      expect(res.revocationReason).toBe('Academic disciplinary action.');
      expect(res.revokedAt).toBeDefined();
    });

    it('returns INTEGRITY_MISMATCH when stored PDF hash diverges from database hash', async () => {
      mockPrisma.passport.findUnique.mockResolvedValue(mockPassportRecord);
      mockStorageService.verifyFileIntegrity.mockResolvedValue(false); // Tampered!

      const res = await service.verifyPassport(validFormattedCode);

      expect(res.status).toBe(VerificationOutcome.INTEGRITY_MISMATCH);
      expect(res.isAuthentic).toBe(false);
      expect(res.message).toContain('integrity check failed');
    });
  });

  describe('revokePassport', () => {
    it('throws NotFoundException when passport does not exist', async () => {
      mockPrisma.passport.findUnique.mockResolvedValue(null);

      await expect(
        service.revokePassport('missing-id', 'Valid reason long enough', 'admin-id', '127.0.0.1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when already revoked', async () => {
      mockPrisma.passport.findUnique.mockResolvedValue({
        ...mockPassportRecord,
        status: 'revoked',
      });

      await expect(
        service.revokePassport('passport-uuid-1', 'Valid reason long enough', 'admin-id', '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully revokes passport and creates immutable audit log record', async () => {
      mockPrisma.passport.findUnique.mockResolvedValue(mockPassportRecord);
      mockPrisma.passport.update.mockResolvedValue({
        ...mockPassportRecord,
        status: 'revoked',
      });

      const res = await service.revokePassport(
        'passport-uuid-1',
        'Revocation due to student request',
        'admin-id',
        '127.0.0.1',
      );

      expect(res.status).toBe('revoked');
      expect(mockPrisma.passport.update).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'passport.revoked',
            actorId: 'admin-id',
            targetType: 'passport',
            targetId: 'passport-uuid-1',
          }),
        }),
      );
    });
  });
});
