import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { IdCardService } from '../id-card/id-card.service.js';
import {
  AttendanceAudience,
  AttendanceMethod,
  AttendanceStatus,
  RecipientType,
  UserStatus,
} from '@csi/shared';
import { generateTotp } from '../../common/crypto/totp.js';

describe('AttendanceService (M9)', () => {
  let service: AttendanceService;
  let mockPrisma: {
    event: { findUnique: jest.Mock };
    attendanceSession: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    attendanceRecord: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    registration: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    roleAssignment: { findMany: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let mockIdCardService: {
    verifyQrPass: jest.Mock;
  };

  const sampleSession = {
    id: 'session-1',
    eventId: 'event-1',
    name: 'Morning Keynote Attendance',
    audience: AttendanceAudience.ALL,
    startsAt: new Date(Date.now() - 3600000),
    endsAt: new Date(Date.now() + 3600000),
    isOpen: true,
    totpSecret: 'JBSWY3DPEHPK3PXP',
    totpStepSeconds: 30,
    createdById: 'organizer-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { records: 5 },
  };

  beforeEach(async () => {
    mockPrisma = {
      event: {
        findUnique: jest.fn(),
      },
      attendanceSession: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      attendanceRecord: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      registration: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      roleAssignment: {
        findMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
    };

    mockIdCardService = {
      verifyQrPass: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IdCardService, useValue: mockIdCardService },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  describe('createSession', () => {
    it('creates attendance session and logs audit entry', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ id: 'event-1', title: 'Tech Talk' });
      mockPrisma.attendanceSession.create.mockResolvedValue(sampleSession);

      const result = await service.createSession(
        'event-1',
        {
          name: 'Morning Keynote Attendance',
          audience: AttendanceAudience.ALL,
          starts_at: '2026-11-01T09:00:00.000Z',
          ends_at: '2026-11-01T10:00:00.000Z',
          is_open: true,
        },
        'organizer-1',
      );

      expect(result.id).toBe('session-1');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ATTENDANCE_SESSION_CREATED',
            actorId: 'organizer-1',
          }),
        }),
      );
    });

    it('throws NotFoundException if event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      await expect(
        service.createSession(
          'non-existent',
          {
            name: 'Morning Session',
            audience: AttendanceAudience.ALL,
            starts_at: '2026-11-01T09:00:00.000Z',
            ends_at: '2026-11-01T10:00:00.000Z',
            is_open: true,
          },
          'organizer-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSession', () => {
    it('returns session with live current_totp_code and verified_count', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);

      const result = await service.getSession('session-1');

      expect(result.id).toBe('session-1');
      expect(result.current_totp_code).toBeDefined();
      expect(result.current_totp_code).toHaveLength(6);
      expect(result.verified_count).toBe(5);
    });
  });

  describe('toggleSession', () => {
    it('flips session open status and logs audit entry', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
      mockPrisma.attendanceSession.update.mockResolvedValue({
        ...sampleSession,
        isOpen: false,
      });

      const result = await service.toggleSession('session-1', 'admin-1');

      expect(result.is_open).toBe(false);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ATTENDANCE_SESSION_TOGGLED',
            actorId: 'admin-1',
          }),
        }),
      );
    });
  });

  describe('checkInQr', () => {
    it('rejects if session is closed', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue({
        ...sampleSession,
        isOpen: false,
      });

      await expect(
        service.checkInQr(
          {
            session_id: 'session-1',
            qr_token: 'csi_pass.payload.sig',
            client_uuid: 'client-uuid-1',
          },
          'volunteer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects if QR pass cryptographic verification fails', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
      mockIdCardService.verifyQrPass.mockResolvedValue({
        valid: false,
        message: 'Cryptographic signature mismatch',
      });

      await expect(
        service.checkInQr(
          {
            session_id: 'session-1',
            qr_token: 'csi_pass.forged.sig',
            client_uuid: 'client-uuid-1',
          },
          'volunteer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate check-in with ConflictException', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
      mockIdCardService.verifyQrPass.mockResolvedValue({
        valid: true,
        user_id: 'member-1',
      });
      mockPrisma.attendanceRecord.findUnique
        .mockResolvedValueOnce(null) // by clientUuid
        .mockResolvedValueOnce({ id: 'existing-record-1' }); // duplicate in session

      await expect(
        service.checkInQr(
          {
            session_id: 'session-1',
            qr_token: 'csi_pass.valid.sig',
            client_uuid: 'client-uuid-new',
          },
          'volunteer-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('verifies attendance and marks registration as attended', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
      mockIdCardService.verifyQrPass.mockResolvedValue({
        valid: true,
        user_id: 'member-1',
      });
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue(null);
      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'record-1',
        sessionId: 'session-1',
        eventId: 'event-1',
        subjectType: RecipientType.MEMBER,
        subjectId: 'member-1',
        method: 'qr_scan',
        status: AttendanceStatus.VERIFIED,
        clientUuid: 'client-uuid-1',
        clientMarkedAt: new Date(),
        verifiedAt: new Date(),
        markedById: 'volunteer-1',
        notes: null,
        createdAt: new Date(),
      });

      const result = await service.checkInQr(
        {
          session_id: 'session-1',
          qr_token: 'csi_pass.valid.sig',
          client_uuid: 'client-uuid-1',
        },
        'volunteer-1',
      );

      expect(result.id).toBe('record-1');
      expect(result.status).toBe(AttendanceStatus.VERIFIED);
      expect(mockPrisma.registration.updateMany).toHaveBeenCalledWith({
        where: {
          eventId: 'event-1',
          userId: 'member-1',
          status: 'registered',
        },
        data: { status: 'attended' },
      });
    });
  });

  describe('checkInTotp', () => {
    it('verifies attendance with valid 6-digit TOTP code', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
      const validCode = generateTotp(sampleSession.totpSecret, sampleSession.totpStepSeconds);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'member-1',
        status: UserStatus.ACTIVE,
      });
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue(null);
      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'record-2',
        sessionId: 'session-1',
        eventId: 'event-1',
        subjectType: RecipientType.MEMBER,
        subjectId: 'member-1',
        method: 'rotating_code',
        status: AttendanceStatus.VERIFIED,
        clientUuid: 'client-uuid-2',
        clientMarkedAt: new Date(),
        verifiedAt: new Date(),
        markedById: 'volunteer-1',
        notes: null,
        createdAt: new Date(),
      });

      const result = await service.checkInTotp(
        {
          session_id: 'session-1',
          totp_code: validCode,
          member_id: 'member-1',
          client_uuid: 'client-uuid-2',
        },
        'volunteer-1',
      );

      expect(result.id).toBe('record-2');
      expect(result.method).toBe('rotating_code');
    });

    it('rejects incorrect 6-digit TOTP code', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);

      await expect(
        service.checkInTotp(
          {
            session_id: 'session-1',
            totp_code: '000000',
            member_id: 'member-1',
            client_uuid: 'client-uuid-3',
          },
          'volunteer-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('checkInManual', () => {
    it('records manual override with logged notes and audit trail', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'member-1',
        status: UserStatus.ACTIVE,
      });
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue(null);
      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'record-3',
        sessionId: 'session-1',
        eventId: 'event-1',
        subjectType: RecipientType.MEMBER,
        subjectId: 'member-1',
        method: 'manual',
        status: AttendanceStatus.VERIFIED,
        clientUuid: 'client-uuid-3',
        clientMarkedAt: new Date(),
        verifiedAt: new Date(),
        markedById: 'volunteer-1',
        notes: 'Verified college student physical ID card',
        createdAt: new Date(),
      });

      const result = await service.checkInManual(
        {
          session_id: 'session-1',
          member_id: 'member-1',
          notes: 'Verified college student physical ID card',
          client_uuid: 'client-uuid-3',
        },
        'volunteer-1',
      );

      expect(result.id).toBe('record-3');
      expect(result.notes).toBe('Verified college student physical ID card');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ATTENDANCE_MANUAL_OVERRIDE',
          }),
        }),
      );
    });
  });

  describe('syncOfflineOperations', () => {
    it('reconciles batch operations and detects duplicate conflicts', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
      mockIdCardService.verifyQrPass.mockResolvedValue({
        valid: true,
        user_id: 'member-1',
      });

      // Op 1: fresh valid QR scan
      // Op 2: duplicate in session
      mockPrisma.attendanceRecord.findUnique
        .mockResolvedValueOnce(null) // op1: by clientUuid
        .mockResolvedValueOnce(null) // op1: by session+subject
        .mockResolvedValueOnce(null) // op2: by clientUuid
        .mockResolvedValueOnce({ id: 'dup-1' }); // op2: duplicate!

      mockPrisma.attendanceRecord.create
        .mockResolvedValueOnce({ id: 'rec-fresh-1' })
        .mockResolvedValueOnce({ id: 'rec-conflict-2' });

      const batch = {
        operations: [
          {
            client_uuid: 'uuid-1',
            session_id: 'session-1',
            method: AttendanceMethod.QR_SCAN,
            payload: 'csi_pass.valid.1',
            client_marked_at: new Date().toISOString(),
          },
          {
            client_uuid: 'uuid-2',
            session_id: 'session-1',
            method: AttendanceMethod.QR_SCAN,
            payload: 'csi_pass.valid.1',
            client_marked_at: new Date().toISOString(),
          },
        ],
      };

      const result = await service.syncOfflineOperations(batch, 'volunteer-1');

      expect(result.synced_count).toBe(1);
      expect(result.conflict_count).toBe(1);
      expect(result.results[0]?.status).toBe(AttendanceStatus.VERIFIED);
      expect(result.results[1]?.status).toBe(AttendanceStatus.FLAGGED_CONFLICT);
    });
  });
});
