import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ParticipantResolverService } from './participant-resolver.service.js';
import { CertificateNumberGeneratorService } from './certificate-number-generator.service.js';
import { CertificateStorageService } from './certificate-storage.service.js';
import { CertificateBatchProcessorService } from './certificate-batch-processor.service.js';
import { CertificateIssuanceService } from './certificate-issuance.service.js';
import { CertificateTemplateEngineService } from './certificate-template-engine.service.js';
import {
  RecipientEligibilityMode,
  BatchStatus,
  CertificateStatus,
  CurrentUser,
  PermissionCode,
} from '@csi/shared';

describe('Certificate Batch Subsystem (M12 Unit Tests)', () => {
  let resolver: ParticipantResolverService;
  let numberGenerator: CertificateNumberGeneratorService;
  let storage: CertificateStorageService;
  let batchProcessor: CertificateBatchProcessorService;
  let issuanceService: CertificateIssuanceService;

  const mockPrisma = {
    event: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    eventGuest: {
      findMany: jest.fn(),
    },
    attendanceRecord: {
      findMany: jest.fn(),
    },
    registration: {
      findMany: jest.fn(),
    },
    certificateBatch: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    certificate: {
      create: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockTemplateEngine = {
    validateTemplate: jest.fn((t) => t),
    renderCertificate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParticipantResolverService,
        CertificateNumberGeneratorService,
        CertificateStorageService,
        CertificateBatchProcessorService,
        CertificateIssuanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CertificateTemplateEngineService, useValue: mockTemplateEngine },
      ],
    }).compile();

    resolver = module.get<ParticipantResolverService>(ParticipantResolverService);
    numberGenerator = module.get<CertificateNumberGeneratorService>(CertificateNumberGeneratorService);
    storage = module.get<CertificateStorageService>(CertificateStorageService);
    batchProcessor = module.get<CertificateBatchProcessorService>(CertificateBatchProcessorService);
    issuanceService = module.get<CertificateIssuanceService>(CertificateIssuanceService);
  });

  describe('1. CertificateNumberGeneratorService', () => {
    it('should generate deterministic certificate numbers for identical inputs', () => {
      const num1 = numberGenerator.generateCertificateNumber(
        'web-bootcamp',
        'ananya@gcet.ac.in',
        'participation',
        2026,
      );
      const num2 = numberGenerator.generateCertificateNumber(
        'web-bootcamp',
        'ananya@gcet.ac.in',
        'participation',
        2026,
      );

      expect(num1).toBe(num2);
      expect(num1).toMatch(/^CSI-2026-WEBBOO-PART-[A-F0-9]{6}$/);
    });

    it('should generate different numbers for different emails or certificate types', () => {
      const num1 = numberGenerator.generateCertificateNumber(
        'web-bootcamp',
        'ananya@gcet.ac.in',
        'participation',
        2026,
      );
      const num2 = numberGenerator.generateCertificateNumber(
        'web-bootcamp',
        'rohit@gcet.ac.in',
        'participation',
        2026,
      );
      const num3 = numberGenerator.generateCertificateNumber(
        'web-bootcamp',
        'ananya@gcet.ac.in',
        'merit',
        2026,
      );

      expect(num1).not.toBe(num2);
      expect(num1).not.toBe(num3);
    });
  });

  describe('2. CertificateStorageService', () => {
    it('should save PDF buffer to disk with SHA-256 integrity hash', async () => {
      const dummyPdf = Buffer.from('%PDF-1.4 test certificate binary');
      const result = await storage.saveCertificatePdf('cert-test-123', dummyPdf, 'batch-456');

      expect(result.storagePath).toContain('cert-test-123.pdf');
      expect(result.fileHash).toHaveLength(64);
      expect(result.fileSizeBytes).toBe(dummyPdf.length);

      // Verify retrieval
      const retrieved = await storage.getCertificatePdf(result.storagePath);
      expect(retrieved.toString()).toBe(dummyPdf.toString());

      // Cleanup
      await storage.deleteCertificatePdf(result.storagePath);
    });

    it('should reject path traversal in certificateId', async () => {
      const dummyPdf = Buffer.from('%PDF-1.4 dummy');
      await expect(
        storage.saveCertificatePdf('../../etc/passwd', dummyPdf),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject path traversal in getCertificatePdf', async () => {
      await expect(
        storage.getCertificatePdf('../../passwords.txt'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. ParticipantResolverService', () => {
    const mockEvent = {
      id: 'event-uuid-1',
      title: 'Full Stack Workshop',
      slug: 'full-stack-workshop',
    };

    it('should throw NotFoundException if event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      await expect(
        resolver.resolveEligibleParticipants(
          'non-existent-event',
          RecipientEligibilityMode.VERIFIED_ATTENDANCE,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should resolve only attendees with verified attendance', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(mockEvent);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([
        { subjectType: 'member', subjectId: 'user-1', status: 'verified' },
        { subjectType: 'guest', subjectId: 'guest-1', status: 'verified' },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1', name: 'Member Attendee', email: 'member@gcet.ac.in' },
      ]);
      mockPrisma.eventGuest.findMany.mockResolvedValue([
        { id: 'guest-1', name: 'Guest Attendee', email: 'guest@other.edu', college: 'Other Uni' },
      ]);

      const result = await resolver.resolveEligibleParticipants(
        mockEvent.id,
        RecipientEligibilityMode.VERIFIED_ATTENDANCE,
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.recipientEmail).toBe('member@gcet.ac.in');
      expect(result[1]?.recipientEmail).toBe('guest@other.edu');
    });

    it('should deduplicate participants with duplicate emails', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(mockEvent);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([
        { subjectType: 'member', subjectId: 'user-1', status: 'verified' },
        { subjectType: 'member', subjectId: 'user-1', status: 'verified' },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1', name: 'Member Attendee', email: 'duplicate@gcet.ac.in' },
      ]);
      mockPrisma.eventGuest.findMany.mockResolvedValue([]);

      const result = await resolver.resolveEligibleParticipants(
        mockEvent.id,
        RecipientEligibilityMode.VERIFIED_ATTENDANCE,
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.recipientEmail).toBe('duplicate@gcet.ac.in');
    });
  });

  describe('4. CertificateBatchProcessorService', () => {
    it('should process pending certificates in batch and transition to completed', async () => {
      mockPrisma.certificateBatch.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.certificateBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        templateConfig: CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE,
        event: { title: 'Test Event', category: 'workshop' },
      });

      mockPrisma.certificate.findMany
        .mockResolvedValueOnce([
          {
            id: 'cert-1',
            recipientName: 'Alice',
            recipientEmail: 'alice@gcet.ac.in',
            certificateNumber: 'CSI-2026-ALICE-01',
            issueDate: 'October 31, 2026',
            status: CertificateStatus.PENDING,
            retryCount: 0,
          },
        ])
        .mockResolvedValueOnce([]) // end of while loop
        .mockResolvedValueOnce([
          { status: CertificateStatus.GENERATED }, // for final count
        ]);

      mockTemplateEngine.renderCertificate.mockResolvedValue({
        pdfBuffer: Buffer.from('%PDF-1.4 rendered dummy'),
        metadata: { pageCount: 1 },
      });

      mockPrisma.certificate.update.mockResolvedValue({});
      mockPrisma.certificateBatch.update.mockResolvedValue({});

      await batchProcessor.processBatch('batch-1');

      expect(mockTemplateEngine.renderCertificate).toHaveBeenCalledTimes(1);
      expect(mockPrisma.certificateBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'batch-1' },
          data: expect.objectContaining({
            status: BatchStatus.COMPLETED,
            successCount: 1,
            failedCount: 0,
          }),
        }),
      );
    });

    it('should isolate single-certificate failure and mark batch partially_completed', async () => {
      mockPrisma.certificateBatch.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.certificateBatch.findUnique.mockResolvedValue({
        id: 'batch-partial',
        templateConfig: CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE,
        event: { title: 'Test Event', category: 'workshop' },
      });

      mockPrisma.certificate.findMany
        .mockResolvedValueOnce([
          {
            id: 'cert-fail',
            recipientName: 'Bob',
            recipientEmail: 'bob@gcet.ac.in',
            certificateNumber: 'CSI-2026-BOB-01',
            issueDate: 'October 31, 2026',
            status: CertificateStatus.PENDING,
            retryCount: 0,
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { status: CertificateStatus.FAILED },
        ]);

      mockTemplateEngine.renderCertificate.mockRejectedValue(new Error('Font embedding error'));

      mockPrisma.certificate.update.mockResolvedValue({});
      mockPrisma.certificateBatch.update.mockResolvedValue({});

      await batchProcessor.processBatch('batch-partial');

      expect(mockPrisma.certificate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cert-fail' },
          data: expect.objectContaining({
            status: CertificateStatus.FAILED,
            errorReason: 'Font embedding error',
          }),
        }),
      );

      expect(mockPrisma.certificateBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'batch-partial' },
          data: expect.objectContaining({
            status: BatchStatus.FAILED,
            failedCount: 1,
          }),
        }),
      );
    });
  });

  describe('5. CertificateIssuanceService', () => {
    it('should return cached response when idempotencyKey matches', async () => {
      const cachedResponse = {
        id: 'cached-batch-id',
        status: BatchStatus.COMPLETED,
        totalCount: 10,
      };

      mockPrisma.idempotencyKey.findUnique.mockResolvedValue({
        key: 'idempotent-key-123',
        response: cachedResponse,
      });

      const result = await issuanceService.createBatch(
        {
          eventId: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          templateId: 'csi-default-participation',
          certificateType: 'participation',
          eligibilityMode: RecipientEligibilityMode.VERIFIED_ATTENDANCE,
          idempotencyKey: 'idempotent-key-123',
        },
        'user-admin-id',
      );

      expect(result).toEqual(cachedResponse);
      expect(mockPrisma.event.findUnique).not.toHaveBeenCalled();
    });

    it('should enforce download authorization checks', async () => {
      const certId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';
      const mockCert = {
        id: certId,
        recipientId: 'recipient-user-id',
        recipientEmail: 'ananya@gcet.ac.in',
        recipientName: 'Ananya Sharma',
        storagePath: 'direct/cert-test.pdf',
        event: { title: 'Workshop', category: 'workshop' },
        batch: null,
      };

      mockPrisma.certificate.findUnique.mockResolvedValue(mockCert);

      // 1. Authorized admin with cert.generate
      const adminUser: CurrentUser = {
        id: 'admin-id',
        full_name: 'Admin User',
        email: 'admin@gcet.ac.in',
        status: 'active',
        roles: ['admin'],
        permissions: [PermissionCode.CERT_GENERATE],
      };

      // Mock storage has file
      jest.spyOn(storage, 'hasCertificatePdf').mockReturnValue(true);
      jest.spyOn(storage, 'getCertificatePdf').mockResolvedValue(Buffer.from('%PDF-1.4 test'));

      const adminDownload = await issuanceService.getCertificateDownload(certId, adminUser);
      expect(adminDownload.filename).toContain('Ananya_Sharma');

      // 2. Authorized recipient
      const recipientUser: CurrentUser = {
        id: 'recipient-user-id',
        full_name: 'Recipient User',
        email: 'ananya@gcet.ac.in',
        status: 'active',
        roles: ['member'],
        permissions: [],
      };

      const recipientDownload = await issuanceService.getCertificateDownload(certId, recipientUser);
      expect(recipientDownload.filename).toContain('Ananya_Sharma');

      // 3. Unauthorized third-party user
      const intruderUser: CurrentUser = {
        id: 'intruder-id',
        full_name: 'Intruder User',
        email: 'intruder@gcet.ac.in',
        status: 'active',
        roles: ['member'],
        permissions: [],
      };

      await expect(
        issuanceService.getCertificateDownload(certId, intruderUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
