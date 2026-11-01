import { Test, TestingModule } from '@nestjs/testing';
import { PassportAggregationService } from '../../../../../apps/api/src/modules/passports/services/passport-aggregation.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { CertificateStorageService } from '../../../../../apps/api/src/modules/certificates/storage/certificate-storage.service.js';
import { CertificateStatus } from '@csi/shared';
import { NotFoundException } from '@nestjs/common';

describe('PassportAggregationService', () => {
  let service: PassportAggregationService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    attendanceRecord: {
      findMany: jest.fn(),
    },
    certificate: {
      findMany: jest.fn(),
    },
    roleAssignment: {
      findMany: jest.fn(),
    },
    passport: {
      findFirst: jest.fn(),
    },
  };

  const mockCertificateStorage = {
    hasCertificatePdf: jest.fn(),
  };

  const mockUser = {
    id: 'user-1',
    name: 'Ananya Sharma',
    email: 'ananya@gcet.ac.in',
    enrollmentNo: '21012011001',
    branch: 'Computer Science & Engineering',
    year: 3,
    status: 'active',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCertificateStorage.hasCertificatePdf.mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PassportAggregationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CertificateStorageService, useValue: mockCertificateStorage },
      ],
    }).compile();

    service = module.get<PassportAggregationService>(PassportAggregationService);
  });

  it('throws NotFoundException when student does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getStudentPassport('non-existent')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('aggregates passport for student with no eligible activities', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
    mockPrisma.certificate.findMany.mockResolvedValue([]);
    mockPrisma.roleAssignment.findMany.mockResolvedValue([]);
    mockPrisma.passport.findFirst.mockResolvedValue(null);

    const res = await service.getStudentPassport('user-1');

    expect(res.student.name).toBe('Ananya Sharma');
    expect(res.summary.eventsAttended).toBe(0);
    expect(res.summary.certificatesEarned).toBe(0);
    expect(res.summary.committeeTenures).toBe(0);
    expect(res.summary.totalActivities).toBe(0);
    expect(res.activities).toHaveLength(0);
    expect(res.latestPassport).toBeNull();
  });

  it('includes verified event attendance and excludes unverified registrations', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);

    // Only attendanceRecord with status: 'verified' is returned by the query
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        eventId: 'event-1',
        subjectId: 'user-1',
        subjectType: 'member',
        method: 'qr_scan',
        status: 'verified',
        verifiedAt: new Date('2026-10-15T10:00:00Z'),
        event: {
          id: 'event-1',
          title: 'Docker & Kubernetes Workshop',
          category: 'workshop',
          startsAt: new Date('2026-10-15T09:00:00Z'),
          endsAt: new Date('2026-10-15T17:00:00Z'),
        },
        session: {
          id: 'session-1',
          name: 'Day 1 Morning Session',
        },
      },
    ]);
    mockPrisma.certificate.findMany.mockResolvedValue([]);
    mockPrisma.roleAssignment.findMany.mockResolvedValue([]);
    mockPrisma.passport.findFirst.mockResolvedValue(null);

    const res = await service.getStudentPassport('user-1');

    expect(res.summary.eventsAttended).toBe(1);
    expect(res.activities).toHaveLength(1);
    expect(res.activities[0]?.title).toBe('Docker & Kubernetes Workshop');
    expect(res.activities[0]?.verificationStatus).toBe('verified');
  });

  it('deduplicates multiple attendance records for the same event', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);

    // Two sessions of the same event attended by the student
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        eventId: 'event-1',
        subjectId: 'user-1',
        subjectType: 'member',
        method: 'qr_scan',
        status: 'verified',
        verifiedAt: new Date('2026-10-15T10:00:00Z'),
        event: {
          id: 'event-1',
          title: 'Cloud DevOps BootCamp',
          category: 'workshop',
          startsAt: new Date('2026-10-15T09:00:00Z'),
          endsAt: new Date('2026-10-16T17:00:00Z'),
        },
        session: { id: 's-1', name: 'Session 1' },
      },
      {
        id: 'rec-2',
        eventId: 'event-1', // Same event
        subjectId: 'user-1',
        subjectType: 'member',
        method: 'qr_scan',
        status: 'verified',
        verifiedAt: new Date('2026-10-16T10:00:00Z'),
        event: {
          id: 'event-1',
          title: 'Cloud DevOps BootCamp',
          category: 'workshop',
          startsAt: new Date('2026-10-15T09:00:00Z'),
          endsAt: new Date('2026-10-16T17:00:00Z'),
        },
        session: { id: 's-2', name: 'Session 2' },
      },
    ]);
    mockPrisma.certificate.findMany.mockResolvedValue([]);
    mockPrisma.roleAssignment.findMany.mockResolvedValue([]);
    mockPrisma.passport.findFirst.mockResolvedValue(null);

    const res = await service.getStudentPassport('user-1');

    expect(res.summary.eventsAttended).toBe(1);
    expect(res.activities).toHaveLength(1);
  });

  it('includes active generated certificates and flags file availability', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

    mockPrisma.certificate.findMany.mockResolvedValue([
      {
        id: 'cert-1',
        recipientId: 'user-1',
        recipientEmail: 'ananya@gcet.ac.in',
        certificateType: 'merit',
        certificateNumber: 'CSI-2026-HACK-MERIT-001',
        achievement: 'First Prize Winner',
        issueDate: '2026-09-20',
        issuedAt: new Date('2026-09-20T12:00:00Z'),
        storagePath: 'batch-1/cert-1.pdf',
        status: CertificateStatus.GENERATED,
        event: { id: 'event-hack', title: 'CSI Annual Hackathon', category: 'hackathon' },
      },
      {
        id: 'cert-2',
        recipientId: 'user-1',
        recipientEmail: 'ananya@gcet.ac.in',
        certificateType: 'participation',
        certificateNumber: 'CSI-2026-AI-PART-002',
        achievement: null,
        issueDate: '2026-10-01',
        issuedAt: new Date('2026-10-01T12:00:00Z'),
        storagePath: 'batch-2/missing.pdf',
        status: CertificateStatus.GENERATED,
        event: { id: 'event-ai', title: 'Generative AI Workshop', category: 'workshop' },
      },
    ]);

    // First certificate file exists, second is missing from storage
    mockCertificateStorage.hasCertificatePdf
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    mockPrisma.roleAssignment.findMany.mockResolvedValue([]);
    mockPrisma.passport.findFirst.mockResolvedValue(null);

    const res = await service.getStudentPassport('user-1');

    expect(res.summary.certificatesEarned).toBe(2);
    const certItem1 = res.activities.find((a) => a.id === 'cert-cert-1');
    const certItem2 = res.activities.find((a) => a.id === 'cert-cert-2');

    expect(certItem1?.certificateFileAvailable).toBe(true);
    expect(certItem2?.certificateFileAvailable).toBe(false);
  });

  it('includes verified committee leadership roles', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
    mockPrisma.certificate.findMany.mockResolvedValue([]);

    mockPrisma.roleAssignment.findMany.mockResolvedValue([
      {
        id: 'ra-1',
        userId: 'user-1',
        termStart: new Date('2026-08-01T00:00:00Z'),
        termEnd: null,
        role: { code: 'core', name: 'Core Committee Member' },
        committee: { code: 'tech', name: 'Technical Committee' },
      },
    ]);

    mockPrisma.passport.findFirst.mockResolvedValue(null);

    const res = await service.getStudentPassport('user-1');

    expect(res.summary.committeeTenures).toBe(1);
    expect(res.activities[0]?.title).toBe('Core Committee Member — Technical Committee');
    expect(res.activities[0]?.category).toBe('leadership');
  });

  it('guarantees records queried match only the specified user ID', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
    mockPrisma.certificate.findMany.mockResolvedValue([]);
    mockPrisma.roleAssignment.findMany.mockResolvedValue([]);
    mockPrisma.passport.findFirst.mockResolvedValue(null);

    await service.getStudentPassport('user-1');

    expect(mockPrisma.attendanceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subjectId: 'user-1' }),
      }),
    );
    expect(mockPrisma.roleAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });
});
