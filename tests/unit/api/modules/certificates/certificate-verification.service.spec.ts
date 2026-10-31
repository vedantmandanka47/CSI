import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  VerificationCodeService,
  CROCKFORD_ALPHABET,
  CertificateVerificationService,
  CertificateStorageService,
} from '../../../../../apps/api/src/modules/certificates/index.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { VerificationOutcome, CertificateStatus } from '@csi/shared';
import { createHash } from 'crypto';

describe('M13 Certificate Verification & Revocation Services', () => {
  let verificationCodeService: VerificationCodeService;
  let verificationService: CertificateVerificationService;

  const mockPrisma = {
    certificate: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown): unknown => cb(mockPrisma));

  const mockStorage = {
    verifyFileIntegrity: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerificationCodeService,
        CertificateVerificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CertificateStorageService, useValue: mockStorage },
      ],
    }).compile();

    verificationCodeService = module.get<VerificationCodeService>(VerificationCodeService);
    verificationService = module.get<CertificateVerificationService>(CertificateVerificationService);
  });

  describe('VerificationCodeService', () => {
    it('should generate 16-character Crockford Base32 codes (80-bit entropy)', () => {
      const code = verificationCodeService.generateVerificationCode();
      expect(code).toBeDefined();
      expect(code.length).toBe(16);

      // Verify every character belongs to Crockford alphabet
      for (const char of code) {
        expect(CROCKFORD_ALPHABET.includes(char)).toBe(true);
      }
    });

    it('should generate unique codes across multiple calls (collision test)', () => {
      const set = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const code = verificationCodeService.generateVerificationCode();
        expect(set.has(code)).toBe(false);
        set.add(code);
      }
      expect(set.size).toBe(100);
    });

    it('should normalize input codes by mapping I/L -> 1 and O -> 0 and stripping spaces/hyphens', () => {
      // '4f7a-9b2i-l8no-w3r5' -> '4F7A9B2118N0W3R5'
      const normalized = verificationCodeService.normalizeVerificationCode('4f7a-9b2i-l8no-w3r5');
      expect(normalized).toBe('4F7A9B2118N0W3R5');
      expect(normalized.length).toBe(16);
    });

    it('should validate valid Crockford Base32 codes', () => {
      expect(verificationCodeService.isValidCode('4F7A-9B2K-M8NQ-W3R5')).toBe(true);
      expect(verificationCodeService.isValidCode('4F7A9B2KM8NQW3R5')).toBe(true);
      expect(verificationCodeService.isValidCode('4f7a9b2km8nqw3r5')).toBe(true);
    });

    it('should reject invalid codes with illegal characters or incorrect lengths', () => {
      expect(verificationCodeService.isValidCode('4F7A-9B2K-M8NQ-W3R')).toBe(false); // 15 chars
      expect(verificationCodeService.isValidCode('4F7A-9B2K-M8NQ-W3R55')).toBe(false); // 17 chars
      expect(verificationCodeService.isValidCode('4F7A-9B2K-M8NQ-W3U5')).toBe(false); // contains U
      expect(verificationCodeService.isValidCode('')).toBe(false);
    });

    it('should compute deterministic SHA-256 hashes of normalized codes', () => {
      const codeA = '4F7A-9B2K-M8NQ-W3R5';
      const codeB = '4f7a 9b2k m8nq w3r5';
      const hashA = verificationCodeService.hashVerificationCode(codeA);
      const hashB = verificationCodeService.hashVerificationCode(codeB);
      expect(hashA).toBe(hashB);
      expect(hashA.length).toBe(64);
    });

    it('should format 16-character codes into 4x4 blocks', () => {
      const formatted = verificationCodeService.formatVerificationCode('4F7A9B2KM8NQW3R5');
      expect(formatted).toBe('4F7A-9B2K-M8NQ-W3R5');
    });

    it('should construct public verification URLs', () => {
      const url = verificationCodeService.buildVerificationUrl('4F7A9B2KM8NQW3R5');
      expect(url).toContain('/verify/4F7A-9B2K-M8NQ-W3R5');
    });
  });

  describe('CertificateVerificationService', () => {
    const rawValidCode = '4F7A-9B2K-M8NQ-W3R5';
    const normalizedCode = '4F7A9B2KM8NQW3R5';
    const codeHash = createHash('sha256').update(normalizedCode).digest('hex');

    const mockCertRecord = {
      id: 'cert-1',
      batchId: 'batch-1',
      eventId: 'event-1',
      recipientId: 'user-1',
      recipientEmail: 'participant@gcet.ac.in',
      recipientName: 'Vedant Mandanka',
      certificateType: 'participation',
      certificateNumber: 'CSI-2026-EVENT-PART-A1B2C3D4',
      issueDate: 'October 31, 2026',
      achievement: null,
      status: CertificateStatus.GENERATED,
      storagePath: 'batch-1/cert-1.pdf',
      fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      fileSizeBytes: 2048,
      issuedAt: new Date('2026-10-31T10:00:00Z'),
      createdAt: new Date('2026-10-31T09:00:00Z'),
      event: { title: 'Hands-on Web Security Workshop' },
    };

    it('should return INVALID outcome for malformed codes', async () => {
      const result = await verificationService.verifyCertificate('too-short');
      expect(result.status).toBe(VerificationOutcome.INVALID);
      expect(result.isAuthentic).toBe(false);
      expect(mockPrisma.certificate.findUnique).not.toHaveBeenCalled();
    });

    it('should return NOT_FOUND outcome when code hash does not exist in DB', async () => {
      mockPrisma.certificate.findUnique.mockResolvedValue(null);

      const result = await verificationService.verifyCertificate(rawValidCode);
      expect(result.status).toBe(VerificationOutcome.NOT_FOUND);
      expect(result.isAuthentic).toBe(false);
      expect(mockPrisma.certificate.findUnique).toHaveBeenCalledWith({
        where: { verificationCodeHash: codeHash },
        include: { event: { select: { title: true } } },
      });
    });

    it('should return VALID outcome with public privacy-preserving fields for authentic certificate', async () => {
      mockPrisma.certificate.findUnique.mockResolvedValue(mockCertRecord);
      mockStorage.verifyFileIntegrity.mockResolvedValue(true);

      const result = await verificationService.verifyCertificate(rawValidCode);
      expect(result.status).toBe(VerificationOutcome.VALID);
      expect(result.isAuthentic).toBe(true);
      expect(result.certificateNumber).toBe('CSI-2026-EVENT-PART-A1B2C3D4');
      expect(result.recipientName).toBe('Vedant Mandanka');
      expect(result.eventName).toBe('Hands-on Web Security Workshop');
      expect(result.issueDate).toBe('October 31, 2026');
      expect(result.issuingInstitution).toBe('Computer Society of India - GCET Student Branch');

      // Verify privacy preservation: private fields are NOT present
      const resObj = result as Record<string, unknown>;
      expect(resObj.recipientEmail).toBeUndefined();
      expect(resObj.recipientId).toBeUndefined();
      expect(resObj.storagePath).toBeUndefined();
      expect(resObj.fileHash).toBeUndefined();
    });

    it('should return INTEGRITY_MISMATCH outcome when file on disk does not match DB checksum', async () => {
      mockPrisma.certificate.findUnique.mockResolvedValue(mockCertRecord);
      mockStorage.verifyFileIntegrity.mockResolvedValue(false); // Checksum mismatch!

      const result = await verificationService.verifyCertificate(rawValidCode);
      expect(result.status).toBe(VerificationOutcome.INTEGRITY_MISMATCH);
      expect(result.isAuthentic).toBe(false);
      expect(result.message).toContain('integrity check failed');
    });

    it('should return REVOKED outcome when certificate status is revoked', async () => {
      const revokedRecord = {
        ...mockCertRecord,
        status: CertificateStatus.REVOKED,
        revokedAt: new Date('2026-10-31T12:00:00Z'),
        revocationReason: 'Participant disqualified due to code of conduct violation.',
      };
      mockPrisma.certificate.findUnique.mockResolvedValue(revokedRecord);

      const result = await verificationService.verifyCertificate(rawValidCode);
      expect(result.status).toBe(VerificationOutcome.REVOKED);
      expect(result.isAuthentic).toBe(false);
      expect(result.revokedAt).toBe('2026-10-31T12:00:00.000Z');
      expect(result.revocationReason).toBe('Participant disqualified due to code of conduct violation.');
      expect(result.message).toContain('revoked');
    });

    describe('revokeCertificate', () => {
      it('should revoke an active certificate and record immutable audit log', async () => {
        mockPrisma.certificate.findUnique.mockResolvedValue(mockCertRecord);
        const updatedCert = {
          ...mockCertRecord,
          status: CertificateStatus.REVOKED,
          revokedAt: new Date(),
          revocationReason: 'Issued to incorrect participant',
          revokedById: 'admin-1',
        };
        mockPrisma.certificate.update.mockResolvedValue(updatedCert);

        const result = await verificationService.revokeCertificate(
          'cert-1',
          'Issued to incorrect participant',
          'admin-1',
          '192.168.1.100',
        );

        expect(result.status).toBe(CertificateStatus.REVOKED);
        expect(mockPrisma.certificate.update).toHaveBeenCalled();
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: 'certificate.revoked',
            actorId: 'admin-1',
            ip: '192.168.1.100',
          }),
        });
      });

      it('should handle repeated revocation requests idempotently without extra audit logs', async () => {
        const alreadyRevoked = {
          ...mockCertRecord,
          status: CertificateStatus.REVOKED,
          revokedAt: new Date(),
          revocationReason: 'Issued to incorrect participant',
          revokedById: 'admin-1',
        };
        mockPrisma.certificate.findUnique.mockResolvedValue(alreadyRevoked);

        const result = await verificationService.revokeCertificate(
          'cert-1',
          'Repeated call reason',
          'admin-1',
        );

        expect(result.status).toBe(CertificateStatus.REVOKED);
        expect(mockPrisma.certificate.update).not.toHaveBeenCalled();
        expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
      });

      it('should reject revocation with reasons shorter than 5 characters', async () => {
        await expect(
          verificationService.revokeCertificate('cert-1', 'bad', 'admin-1'),
        ).rejects.toThrow(BadRequestException);
      });

      it('should throw NotFoundException if certificate does not exist', async () => {
        mockPrisma.certificate.findUnique.mockResolvedValue(null);

        await expect(
          verificationService.revokeCertificate('non-existent', 'Valid reason here', 'admin-1'),
        ).rejects.toThrow(NotFoundException);
      });
    });
  });
});
