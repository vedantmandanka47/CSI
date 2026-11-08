import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AttendanceService } from '../../../../../apps/api/src/modules/attendance/attendance.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { IdCardService } from '../../../../../apps/api/src/modules/id-card/id-card.service.js';
import {
  AttendanceAudience,
  AttendanceMethod,
  AttendanceStatus,
  RecipientType,
  UserStatus,
  RoleCode,
  ErrorCode,
} from '@csi/shared';
import { generateTotp } from '../../../../../apps/api/src/common/crypto/totp.js';

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
        findUnique: jest.fn().mockResolvedValue({ id: 'member-1', status: UserStatus.ACTIVE }),
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
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ATTENDANCE_RECORDED',
            afterJson: expect.objectContaining({
              sync_mode: 'offline_reconciled',
            }),
          }),
        }),
      );
    });

    it('rejects offline sync if attendance session is closed (TASK-022 / B18 / F07)', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue({
        ...sampleSession,
        isOpen: false,
      });

      const batch = {
        operations: [
          {
            client_uuid: 'uuid-closed-session',
            session_id: 'session-1',
            method: AttendanceMethod.MANUAL,
            payload: 'manual-override',
            member_id: 'member-1',
            notes: 'Physical ID checked',
            client_marked_at: new Date().toISOString(),
          },
        ],
      };

      const result = await service.syncOfflineOperations(batch, 'volunteer-1');

      expect(result.rejected_count).toBe(1);
      expect(result.results[0]?.status).toBe(AttendanceStatus.REJECTED);
      expect(result.results[0]?.message).toContain('Attendance session is currently closed.');
    });

    it('rejects offline sync if member record is inactive or suspended (TASK-022 / B18 / F07)', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'member-inactive',
        status: UserStatus.INACTIVE,
      });

      const batch = {
        operations: [
          {
            client_uuid: 'uuid-inactive-member',
            session_id: 'session-1',
            method: AttendanceMethod.MANUAL,
            payload: 'manual-override',
            member_id: 'member-inactive',
            notes: 'Physical ID checked',
            client_marked_at: new Date().toISOString(),
          },
        ],
      };

      const result = await service.syncOfflineOperations(batch, 'volunteer-1');

      expect(result.rejected_count).toBe(1);
      expect(result.results[0]?.status).toBe(AttendanceStatus.REJECTED);
      expect(result.results[0]?.message).toContain('Target member record is not in active standing.');
    });

    it('rejects offline sync manual override without mandatory verification reason (TASK-022 / B18 / F07)', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'member-1',
        status: UserStatus.ACTIVE,
      });

      const batch = {
        operations: [
          {
            client_uuid: 'uuid-no-notes',
            session_id: 'session-1',
            method: AttendanceMethod.MANUAL,
            payload: 'manual-override',
            member_id: 'member-1',
            notes: '  ', // empty / invalid notes
            client_marked_at: new Date().toISOString(),
          },
        ],
      };

      const result = await service.syncOfflineOperations(batch, 'volunteer-1');

      expect(result.rejected_count).toBe(1);
      expect(result.results[0]?.status).toBe(AttendanceStatus.REJECTED);
      expect(result.results[0]?.message).toContain('Manual attendance override requires a mandatory verification reason');
    });

    it('rejects offline sync if member is not eligible for session audience tier (TASK-022 / B18 / F07)', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue({
        ...sampleSession,
        audience: AttendanceAudience.PARTICIPANTS,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'unregistered-member',
        status: UserStatus.ACTIVE,
      });
      // No registration found
      mockPrisma.registration.findFirst.mockResolvedValue(null);

      const batch = {
        operations: [
          {
            client_uuid: 'uuid-ineligible-audience',
            session_id: 'session-1',
            method: AttendanceMethod.MANUAL,
            payload: 'manual-override',
            member_id: 'unregistered-member',
            notes: 'Physical ID verified',
            client_marked_at: new Date().toISOString(),
          },
        ],
      };

      const result = await service.syncOfflineOperations(batch, 'volunteer-1');

      expect(result.rejected_count).toBe(1);
      expect(result.results[0]?.status).toBe(AttendanceStatus.REJECTED);
      expect(result.results[0]?.message).toContain('Member does not hold a confirmed registration for this event.');
    });

    it('rejects offline queue replay with expired QR codes with descriptive error (TASK-023 / B18 / F08)', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
      mockIdCardService.verifyQrPass.mockResolvedValue({
        valid: false,
        message: 'QR pass was expired at capture time.',
      });

      const batch = {
        operations: [
          {
            client_uuid: 'uuid-expired-replay',
            session_id: 'session-1',
            method: AttendanceMethod.QR_SCAN,
            payload: 'csi_pass.expired.replay',
            client_marked_at: new Date().toISOString(),
          },
        ],
      };

      const result = await service.syncOfflineOperations(batch, 'volunteer-1');

      expect(result.rejected_count).toBe(1);
      expect(result.results[0]?.status).toBe(AttendanceStatus.REJECTED);
      expect(result.results[0]?.message).toBe('QR pass was expired at capture time.');
      expect(mockIdCardService.verifyQrPass).toHaveBeenCalledWith(
        'csi_pass.expired.replay',
        expect.objectContaining({
          captureTimestamp: expect.any(Date),
          maxSyncWindowSec: 86400,
        }),
      );
    });
  });

  describe('Attendance Audience Tiers & Active Tenure Filtering (TASK-024 / B18 / F09)', () => {
    it('rejects check-in to CORE audience session if officer holds an expired role tenure', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue({
        ...sampleSession,
        audience: AttendanceAudience.CORE,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'officer-expired',
        status: UserStatus.ACTIVE,
      });

      // Prisma filters out expired tenure, returning empty array
      mockPrisma.roleAssignment.findMany.mockResolvedValue([]);

      await expect(
        service.checkInManual(
          {
            session_id: 'session-1',
            member_id: 'officer-expired',
            notes: 'Physical attendance verified',
            client_uuid: 'uuid-core-expired',
          },
          'admin-1',
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.roleAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'officer-expired',
            termStart: { lte: expect.any(Date) },
            OR: [{ termEnd: null }, { termEnd: { gte: expect.any(Date) } }],
          }),
        }),
      );
    });

    it('rejects check-in to CORE audience session for member holding only SUBCORE role', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue({
        ...sampleSession,
        audience: AttendanceAudience.CORE,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'subcore-member',
        status: UserStatus.ACTIVE,
      });

      // Active subcore role returned
      mockPrisma.roleAssignment.findMany.mockResolvedValue([
        { role: { code: RoleCode.SUBCORE } },
      ]);

      await expect(
        service.checkInManual(
          {
            session_id: 'session-1',
            member_id: 'subcore-member',
            notes: 'Physical attendance verified',
            client_uuid: 'uuid-subcore-on-core',
          },
          'admin-1',
        ),
      ).rejects.toThrow(
        'Member does not hold an active role in authorized audience tier "core".',
      );
    });

    it('rejects check-in to CORE audience session for member holding only COMMITTEE volunteer role', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue({
        ...sampleSession,
        audience: AttendanceAudience.CORE,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'volunteer-member',
        status: UserStatus.ACTIVE,
      });

      mockPrisma.roleAssignment.findMany.mockResolvedValue([
        { role: { code: RoleCode.COMMITTEE } },
      ]);

      await expect(
        service.checkInManual(
          {
            session_id: 'session-1',
            member_id: 'volunteer-member',
            notes: 'Physical attendance verified',
            client_uuid: 'uuid-volunteer-on-core',
          },
          'admin-1',
        ),
      ).rejects.toThrow(
        'Member does not hold an active role in authorized audience tier "core".',
      );
    });

    it('rejects check-in to SUBCORE audience session for member holding only COMMITTEE volunteer role', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue({
        ...sampleSession,
        audience: AttendanceAudience.SUBCORE,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'volunteer-member',
        status: UserStatus.ACTIVE,
      });

      mockPrisma.roleAssignment.findMany.mockResolvedValue([
        { role: { code: RoleCode.COMMITTEE } },
      ]);

      await expect(
        service.checkInManual(
          {
            session_id: 'session-1',
            member_id: 'volunteer-member',
            notes: 'Physical attendance verified',
            client_uuid: 'uuid-volunteer-on-subcore',
          },
          'admin-1',
        ),
      ).rejects.toThrow(
        'Member does not hold an active role in authorized audience tier "subcore".',
      );
    });

    it('permits check-in to CORE audience session for member holding active CORE role', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue({
        ...sampleSession,
        audience: AttendanceAudience.CORE,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'core-member',
        status: UserStatus.ACTIVE,
      });
      mockPrisma.roleAssignment.findMany.mockResolvedValue([
        { role: { code: RoleCode.CORE } },
      ]);
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue(null);
      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'rec-core-1',
        sessionId: 'session-1',
        eventId: 'event-1',
        subjectType: RecipientType.MEMBER,
        subjectId: 'core-member',
        method: AttendanceMethod.MANUAL,
        status: AttendanceStatus.VERIFIED,
        clientUuid: 'uuid-core-valid',
        notes: 'Core meeting check-in verified',
        markedById: 'admin-1',
        verifiedAt: new Date(),
        clientMarkedAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.checkInManual(
        {
          session_id: 'session-1',
          member_id: 'core-member',
          notes: 'Core meeting check-in verified',
          client_uuid: 'uuid-core-valid',
        },
        'admin-1',
      );

      expect(result.id).toBe('rec-core-1');
      expect(result.status).toBe(AttendanceStatus.VERIFIED);
    });

    it('permits check-in to CORE audience session for active executive (PRESIDENT / VP / ADMIN)', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue({
        ...sampleSession,
        audience: AttendanceAudience.CORE,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'president-user',
        status: UserStatus.ACTIVE,
      });
      mockPrisma.roleAssignment.findMany.mockResolvedValue([
        { role: { code: RoleCode.PRESIDENT } },
      ]);
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue(null);
      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'rec-pres-1',
        sessionId: 'session-1',
        eventId: 'event-1',
        subjectType: RecipientType.MEMBER,
        subjectId: 'president-user',
        method: AttendanceMethod.MANUAL,
        status: AttendanceStatus.VERIFIED,
        clientUuid: 'uuid-pres-valid',
        notes: 'Executive check-in verified',
        markedById: 'admin-1',
        verifiedAt: new Date(),
        clientMarkedAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.checkInManual(
        {
          session_id: 'session-1',
          member_id: 'president-user',
          notes: 'Executive check-in verified',
          client_uuid: 'uuid-pres-valid',
        },
        'admin-1',
      );

      expect(result.id).toBe('rec-pres-1');
      expect(result.status).toBe(AttendanceStatus.VERIFIED);
    });

    it('permits check-in to SUBCORE audience session for active SUBCORE role holder', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue({
        ...sampleSession,
        audience: AttendanceAudience.SUBCORE,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'subcore-user',
        status: UserStatus.ACTIVE,
      });
      mockPrisma.roleAssignment.findMany.mockResolvedValue([
        { role: { code: RoleCode.SUBCORE } },
      ]);
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue(null);
      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'rec-subcore-1',
        sessionId: 'session-1',
        eventId: 'event-1',
        subjectType: RecipientType.MEMBER,
        subjectId: 'subcore-user',
        method: AttendanceMethod.MANUAL,
        status: AttendanceStatus.VERIFIED,
        clientUuid: 'uuid-subcore-valid',
        notes: 'Subcore check-in verified',
        markedById: 'admin-1',
        verifiedAt: new Date(),
        clientMarkedAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.checkInManual(
        {
          session_id: 'session-1',
          member_id: 'subcore-user',
          notes: 'Subcore check-in verified',
          client_uuid: 'uuid-subcore-valid',
        },
        'admin-1',
      );

      expect(result.id).toBe('rec-subcore-1');
      expect(result.status).toBe(AttendanceStatus.VERIFIED);
    });

    it('permits check-in to VOLUNTEERS audience session for active COMMITTEE volunteer', async () => {
      mockPrisma.attendanceSession.findUnique.mockResolvedValue({
        ...sampleSession,
        audience: AttendanceAudience.VOLUNTEERS,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'volunteer-user',
        status: UserStatus.ACTIVE,
      });
      mockPrisma.roleAssignment.findMany.mockResolvedValue([
        { role: { code: RoleCode.COMMITTEE } },
      ]);
      mockPrisma.attendanceRecord.findUnique.mockResolvedValue(null);
      mockPrisma.attendanceRecord.create.mockResolvedValue({
        id: 'rec-vol-1',
        sessionId: 'session-1',
        eventId: 'event-1',
        subjectType: RecipientType.MEMBER,
        subjectId: 'volunteer-user',
        method: AttendanceMethod.MANUAL,
        status: AttendanceStatus.VERIFIED,
        clientUuid: 'uuid-vol-valid',
        notes: 'Volunteer check-in verified',
        markedById: 'admin-1',
        verifiedAt: new Date(),
        clientMarkedAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.checkInManual(
        {
          session_id: 'session-1',
          member_id: 'volunteer-user',
          notes: 'Volunteer check-in verified',
          client_uuid: 'uuid-vol-valid',
        },
        'admin-1',
      );

      expect(result.id).toBe('rec-vol-1');
      expect(result.status).toBe(AttendanceStatus.VERIFIED);
    });
  });

  describe('Attendance Idempotency Binding (TASK-026 / F44)', () => {
    describe('checkInQr idempotency binding', () => {
      it('returns existing record if client_uuid replay matches session, member, and actor', async () => {
        mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
        mockIdCardService.verifyQrPass.mockResolvedValue({
          valid: true,
          user_id: 'member-1',
        });
        mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
          id: 'rec-qr-existing',
          sessionId: 'session-1',
          eventId: 'event-1',
          subjectType: RecipientType.MEMBER,
          subjectId: 'member-1',
          method: AttendanceMethod.QR_SCAN,
          status: AttendanceStatus.VERIFIED,
          clientUuid: 'uuid-qr-1',
          clientMarkedAt: new Date(),
          verifiedAt: new Date(),
          markedById: 'volunteer-1',
          notes: null,
          createdAt: new Date(),
        });

        const result = await service.checkInQr(
          {
            session_id: 'session-1',
            qr_token: 'valid.token',
            client_uuid: 'uuid-qr-1',
          },
          'volunteer-1',
        );

        expect(result.id).toBe('rec-qr-existing');
        expect(result.status).toBe(AttendanceStatus.VERIFIED);
      });

      it('rejects with IDEMPOTENCY_PAYLOAD_MISMATCH if client_uuid belongs to a different member', async () => {
        mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
        mockIdCardService.verifyQrPass.mockResolvedValue({
          valid: true,
          user_id: 'member-1',
        });
        mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
          id: 'rec-qr-existing',
          sessionId: 'session-1',
          subjectId: 'member-DIFFERENT',
          markedById: 'volunteer-1',
        });

        await expect(
          service.checkInQr(
            {
              session_id: 'session-1',
              qr_token: 'valid.token',
              client_uuid: 'uuid-qr-1',
            },
            'volunteer-1',
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
          }),
        });
      });

      it('rejects with IDEMPOTENCY_PAYLOAD_MISMATCH if client_uuid was marked by a different actor', async () => {
        mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
        mockIdCardService.verifyQrPass.mockResolvedValue({
          valid: true,
          user_id: 'member-1',
        });
        mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
          id: 'rec-qr-existing',
          sessionId: 'session-1',
          subjectId: 'member-1',
          markedById: 'DIFFERENT-ACTOR',
        });

        await expect(
          service.checkInQr(
            {
              session_id: 'session-1',
              qr_token: 'valid.token',
              client_uuid: 'uuid-qr-1',
            },
            'volunteer-1',
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
          }),
        });
      });

      it('rejects with IDEMPOTENCY_PAYLOAD_MISMATCH if client_uuid was recorded for a different session', async () => {
        mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
        mockIdCardService.verifyQrPass.mockResolvedValue({
          valid: true,
          user_id: 'member-1',
        });
        mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
          id: 'rec-qr-existing',
          sessionId: 'DIFFERENT-SESSION',
          subjectId: 'member-1',
          markedById: 'volunteer-1',
        });

        await expect(
          service.checkInQr(
            {
              session_id: 'session-1',
              qr_token: 'valid.token',
              client_uuid: 'uuid-qr-1',
            },
            'volunteer-1',
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
          }),
        });
      });
    });

    describe('checkInTotp idempotency binding', () => {
      it('returns existing record if client_uuid replay matches session, member, and actor without re-evaluating TOTP', async () => {
        mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
        mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
          id: 'rec-totp-existing',
          sessionId: 'session-1',
          eventId: 'event-1',
          subjectType: RecipientType.MEMBER,
          subjectId: 'member-1',
          method: AttendanceMethod.ROTATING_CODE,
          status: AttendanceStatus.VERIFIED,
          clientUuid: 'uuid-totp-1',
          clientMarkedAt: new Date(),
          verifiedAt: new Date(),
          markedById: 'volunteer-1',
          notes: null,
          createdAt: new Date(),
        });

        const result = await service.checkInTotp(
          {
            session_id: 'session-1',
            totp_code: '000000',
            member_id: 'member-1',
            client_uuid: 'uuid-totp-1',
          },
          'volunteer-1',
        );

        expect(result.id).toBe('rec-totp-existing');
      });

      it('rejects with IDEMPOTENCY_PAYLOAD_MISMATCH if client_uuid belongs to a different member or actor', async () => {
        mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
        mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
          id: 'rec-totp-existing',
          sessionId: 'session-1',
          subjectId: 'other-member',
          markedById: 'volunteer-1',
        });

        await expect(
          service.checkInTotp(
            {
              session_id: 'session-1',
              totp_code: '123456',
              member_id: 'member-1',
              client_uuid: 'uuid-totp-1',
            },
            'volunteer-1',
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
          }),
        });
      });
    });

    describe('checkInManual idempotency binding', () => {
      it('returns existing record if client_uuid replay matches session, member, and actor', async () => {
        mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
        mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
          id: 'rec-man-existing',
          sessionId: 'session-1',
          eventId: 'event-1',
          subjectType: RecipientType.MEMBER,
          subjectId: 'member-1',
          method: AttendanceMethod.MANUAL,
          status: AttendanceStatus.VERIFIED,
          clientUuid: 'uuid-man-1',
          clientMarkedAt: new Date(),
          verifiedAt: new Date(),
          markedById: 'volunteer-1',
          notes: 'Previously marked note',
          createdAt: new Date(),
        });

        const result = await service.checkInManual(
          {
            session_id: 'session-1',
            member_id: 'member-1',
            notes: 'Any note on retry',
            client_uuid: 'uuid-man-1',
          },
          'volunteer-1',
        );

        expect(result.id).toBe('rec-man-existing');
        expect(result.notes).toBe('Previously marked note');
      });

      it('rejects with IDEMPOTENCY_PAYLOAD_MISMATCH if client_uuid was marked by a different actor', async () => {
        mockPrisma.attendanceSession.findUnique.mockResolvedValue(sampleSession);
        mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
          id: 'rec-man-existing',
          sessionId: 'session-1',
          subjectId: 'member-1',
          markedById: 'different-actor',
        });

        await expect(
          service.checkInManual(
            {
              session_id: 'session-1',
              member_id: 'member-1',
              notes: 'Manual check note',
              client_uuid: 'uuid-man-1',
            },
            'volunteer-1',
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
          }),
        });
      });
    });

    describe('syncOfflineOperations idempotency binding', () => {
      it('accepts idempotent replay if client_uuid matches session, member, and actor', async () => {
        mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
          id: 'rec-offline-existing',
          sessionId: 'session-1',
          subjectId: 'member-1',
          markedById: 'volunteer-1',
          status: AttendanceStatus.VERIFIED,
        });

        const res = await service.syncOfflineOperations(
          {
            operations: [
              {
                client_uuid: 'uuid-offline-replay',
                session_id: 'session-1',
                method: AttendanceMethod.ROTATING_CODE,
                payload: '123456',
                member_id: 'member-1',
                client_marked_at: new Date().toISOString(),
              },
            ],
          },
          'volunteer-1',
        );

        expect(res.results[0]?.status).toBe(AttendanceStatus.VERIFIED);
        expect(res.results[0]?.message).toBe('Already processed (idempotent replay).');
        expect(res.synced_count).toBe(1);
      });

      it('rejects offline sync operation if client_uuid was marked by a different actor', async () => {
        mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
          id: 'rec-offline-existing',
          sessionId: 'session-1',
          subjectId: 'member-1',
          markedById: 'actor-A',
          status: AttendanceStatus.VERIFIED,
        });

        const res = await service.syncOfflineOperations(
          {
            operations: [
              {
                client_uuid: 'uuid-offline-actor-mismatch',
                session_id: 'session-1',
                method: AttendanceMethod.ROTATING_CODE,
                payload: '123456',
                member_id: 'member-1',
                client_marked_at: new Date().toISOString(),
              },
            ],
          },
          'actor-B',
        );

        expect(res.results[0]?.status).toBe(AttendanceStatus.REJECTED);
        expect(res.results[0]?.message).toContain('already processed with a different session, member, or actor');
        expect(res.rejected_count).toBe(1);
      });

      it('rejects offline sync operation if client_uuid belongs to a different session or member', async () => {
        mockPrisma.attendanceRecord.findUnique.mockResolvedValueOnce({
          id: 'rec-offline-existing',
          sessionId: 'session-DIFFERENT',
          subjectId: 'member-1',
          markedById: 'volunteer-1',
          status: AttendanceStatus.VERIFIED,
        });

        const res = await service.syncOfflineOperations(
          {
            operations: [
              {
                client_uuid: 'uuid-offline-session-mismatch',
                session_id: 'session-1',
                method: AttendanceMethod.ROTATING_CODE,
                payload: '123456',
                member_id: 'member-1',
                client_marked_at: new Date().toISOString(),
              },
            ],
          },
          'volunteer-1',
        );

        expect(res.results[0]?.status).toBe(AttendanceStatus.REJECTED);
        expect(res.results[0]?.message).toContain('already processed with a different session, member, or actor');
        expect(res.rejected_count).toBe(1);
      });
    });
  });
});
