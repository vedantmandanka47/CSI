import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { IdCardService } from '../id-card/id-card.service.js';
import { generateBase32Secret, generateTotp, verifyTotp } from '../../common/crypto/totp.js';
import { encryptAes256Gcm, decryptAes256Gcm } from '../../common/crypto/encryption.js';
import { env } from '../../config/env.js';
import {
  AttendanceAudience,
  AttendanceMethod,
  AttendanceStatus,
  RecipientType,
  AttendanceSession,
  AttendanceRecord,
  CreateAttendanceSessionInput,
  CheckInQrInput,
  CheckInTotpInput,
  CheckInManualInput,
  BatchSyncAttendanceInput,
  BatchSyncAttendanceResponse,
  AttendanceSyncResult,
  ErrorCode,
  UserStatus,
  RegistrationStatus,
  SEAT_CONSUMING_STATUSES,
  RoleCode,
} from '@csi/shared';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idCardService: IdCardService,
  ) {}

  /**
   * Create an attendance session for an event.
   */
  async createSession(
    eventId: string,
    input: CreateAttendanceSessionInput,
    createdById: string,
  ): Promise<AttendanceSession> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Event not found.',
      });
    }

    const plainSecret = generateBase32Secret(20);
    const totpSecret = encryptAes256Gcm(plainSecret, env.APP_ENCRYPTION_KEY);

    const session = await this.prisma.attendanceSession.create({
      data: {
        eventId,
        name: input.name,
        audience: input.audience,
        startsAt: new Date(input.starts_at),
        endsAt: new Date(input.ends_at),
        isOpen: input.is_open ?? true,
        totpSecret,
        totpStepSeconds: 30,
        createdById,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: createdById,
        action: 'ATTENDANCE_SESSION_CREATED',
        targetType: 'attendance_session',
        targetId: session.id,
        afterJson: {
          session_id: session.id,
          event_id: eventId,
          name: session.name,
          audience: session.audience,
        },
      },
    });

    return this.mapSession(session);
  }

  /**
   * List attendance sessions for an event.
   */
  async listSessions(eventId: string): Promise<AttendanceSession[]> {
    const sessions = await this.prisma.attendanceSession.findMany({
      where: { eventId },
      include: {
        _count: {
          select: {
            records: {
              where: { status: AttendanceStatus.VERIFIED },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((s) => ({
      ...this.mapSession(s),
      verified_count: s._count.records,
    }));
  }

  /**
   * Get single attendance session with live TOTP code for display.
   */
  async getSession(sessionId: string): Promise<AttendanceSession> {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        _count: {
          select: {
            records: {
              where: { status: AttendanceStatus.VERIFIED },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Attendance session not found.',
      });
    }

    const plainSecret = decryptAes256Gcm(session.totpSecret, env.APP_ENCRYPTION_KEY);
    const currentTotpCode = generateTotp(plainSecret, session.totpStepSeconds);

    return {
      ...this.mapSession(session),
      current_totp_code: currentTotpCode,
      verified_count: session._count.records,
    };
  }

  /**
   * Toggle attendance session open/closed status.
   */
  async toggleSession(sessionId: string, actorId: string): Promise<AttendanceSession> {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Attendance session not found.',
      });
    }

    const updated = await this.prisma.attendanceSession.update({
      where: { id: sessionId },
      data: { isOpen: !session.isOpen },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'ATTENDANCE_SESSION_TOGGLED',
        targetType: 'attendance_session',
        targetId: sessionId,
        beforeJson: { is_open: session.isOpen },
        afterJson: { is_open: updated.isOpen },
      },
    });

    return this.mapSession(updated);
  }

  /**
   * Check in via dynamic cryptographic QR pass.
   */
  async checkInQr(input: CheckInQrInput, markedById: string): Promise<AttendanceRecord> {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: input.session_id },
    });

    if (!session) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Attendance session not found.',
      });
    }

    const markedAt = input.client_marked_at ? new Date(input.client_marked_at) : new Date();
    this.validateSessionBounds(session, markedAt, true);

    // 1. Verify cryptographic QR Pass
    const verifyResult = await this.idCardService.verifyQrPass(input.qr_token);
    if (!verifyResult.valid || !verifyResult.user_id) {
      throw new BadRequestException({
        code: 'INVALID_QR_PASS',
        message: verifyResult.message || 'Cryptographic verification failed for QR pass.',
      });
    }

    const memberId = verifyResult.user_id;

    // 2. Centralized validation engine (session status, active user standing, audience eligibility)
    await this.validateAttendanceCandidate({
      session,
      memberId,
      method: AttendanceMethod.QR_SCAN,
      markedAt,
      isOnline: true,
    });

    // 3. Idempotent check by client_uuid
    const existingByClientUuid = await this.prisma.attendanceRecord.findUnique({
      where: { clientUuid: input.client_uuid },
    });
    if (existingByClientUuid) {
      return this.mapRecord(existingByClientUuid);
    }

    // 4. Duplicate check for this session
    const existingRecord = await this.prisma.attendanceRecord.findUnique({
      where: {
        session_subject_unique: {
          sessionId: session.id,
          subjectType: RecipientType.MEMBER,
          subjectId: memberId,
        },
      },
    });

    if (existingRecord) {
      throw new ConflictException({
        code: 'ATTENDANCE_ALREADY_MARKED',
        message: 'Student attendance has already been recorded for this session.',
      });
    }

    // 5. Create verified record within transaction
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.attendanceRecord.create({
        data: {
          sessionId: session.id,
          eventId: session.eventId,
          subjectType: RecipientType.MEMBER,
          subjectId: memberId,
          method: AttendanceMethod.QR_SCAN,
          status: AttendanceStatus.VERIFIED,
          clientUuid: input.client_uuid,
          clientMarkedAt: input.client_marked_at ? new Date(input.client_marked_at) : new Date(),
          verifiedAt: new Date(),
          markedById,
        },
      });

      // Update event registration status to 'attended'
      await tx.registration.updateMany({
        where: {
          eventId: session.eventId,
          userId: memberId,
          status: RegistrationStatus.REGISTERED,
        },
        data: { status: RegistrationStatus.ATTENDED },
      });

      await tx.auditLog.create({
        data: {
          actorId: markedById,
          action: 'ATTENDANCE_RECORDED',
          targetType: 'attendance_record',
          targetId: record.id,
          afterJson: {
            session_id: session.id,
            event_id: session.eventId,
            member_id: memberId,
            method: AttendanceMethod.QR_SCAN,
          },
        },
      });

      return this.mapRecord(record);
    });
  }

  /**
   * Check in via 6-digit rotating TOTP code.
   */
  async checkInTotp(input: CheckInTotpInput, markedById: string): Promise<AttendanceRecord> {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: input.session_id },
    });

    if (!session) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Attendance session not found.',
      });
    }

    const markedAt = new Date();

    // 1. Centralized validation engine (session status, active user standing, audience eligibility)
    await this.validateAttendanceCandidate({
      session,
      memberId: input.member_id,
      method: AttendanceMethod.ROTATING_CODE,
      markedAt,
      isOnline: true,
    });

    // 2. Verify TOTP code (accept current step +/- 1 step)
    const plainSecret = decryptAes256Gcm(session.totpSecret, env.APP_ENCRYPTION_KEY);
    const isCodeValid = verifyTotp(
      input.totp_code,
      plainSecret,
      session.totpStepSeconds,
      1,
    );

    if (!isCodeValid) {
      throw new BadRequestException({
        code: 'INVALID_TOTP_CODE',
        message: 'Invalid or expired 6-digit attendance code.',
      });
    }

    // 4. Idempotent check by client_uuid
    const existingByClientUuid = await this.prisma.attendanceRecord.findUnique({
      where: { clientUuid: input.client_uuid },
    });
    if (existingByClientUuid) {
      return this.mapRecord(existingByClientUuid);
    }

    // 5. Duplicate check
    const existingRecord = await this.prisma.attendanceRecord.findUnique({
      where: {
        session_subject_unique: {
          sessionId: session.id,
          subjectType: RecipientType.MEMBER,
          subjectId: input.member_id,
        },
      },
    });

    if (existingRecord) {
      throw new ConflictException({
        code: 'ATTENDANCE_ALREADY_MARKED',
        message: 'Student attendance has already been recorded for this session.',
      });
    }

    // 6. Create verified record within transaction
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.attendanceRecord.create({
        data: {
          sessionId: session.id,
          eventId: session.eventId,
          subjectType: RecipientType.MEMBER,
          subjectId: input.member_id,
          method: AttendanceMethod.ROTATING_CODE,
          status: AttendanceStatus.VERIFIED,
          clientUuid: input.client_uuid,
          clientMarkedAt: input.client_marked_at ? new Date(input.client_marked_at) : new Date(),
          verifiedAt: new Date(),
          markedById,
        },
      });

      await tx.registration.updateMany({
        where: {
          eventId: session.eventId,
          userId: input.member_id,
          status: RegistrationStatus.REGISTERED,
        },
        data: { status: RegistrationStatus.ATTENDED },
      });

      await tx.auditLog.create({
        data: {
          actorId: markedById,
          action: 'ATTENDANCE_RECORDED',
          targetType: 'attendance_record',
          targetId: record.id,
          afterJson: {
            session_id: session.id,
            event_id: session.eventId,
            member_id: input.member_id,
            method: AttendanceMethod.ROTATING_CODE,
          },
        },
      });

      return this.mapRecord(record);
    });
  }

  /**
   * Authorized manual volunteer override with mandatory logged notes.
   */
  async checkInManual(input: CheckInManualInput, markedById: string): Promise<AttendanceRecord> {
    const session = await this.prisma.attendanceSession.findUnique({
      where: { id: input.session_id },
    });

    if (!session) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Attendance session not found.',
      });
    }

    const markedAt = new Date();

    // 1. Centralized validation engine (session status, active user standing, audience eligibility, manual notes)
    await this.validateAttendanceCandidate({
      session,
      memberId: input.member_id,
      method: AttendanceMethod.MANUAL,
      markedAt,
      isOnline: true,
      notes: input.notes,
    });

    // Idempotent check
    const existingByClientUuid = await this.prisma.attendanceRecord.findUnique({
      where: { clientUuid: input.client_uuid },
    });
    if (existingByClientUuid) {
      return this.mapRecord(existingByClientUuid);
    }

    // Duplicate check
    const existingRecord = await this.prisma.attendanceRecord.findUnique({
      where: {
        session_subject_unique: {
          sessionId: session.id,
          subjectType: RecipientType.MEMBER,
          subjectId: input.member_id,
        },
      },
    });

    if (existingRecord) {
      throw new ConflictException({
        code: 'ATTENDANCE_ALREADY_MARKED',
        message: 'Student attendance has already been recorded for this session.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const record = await tx.attendanceRecord.create({
        data: {
          sessionId: session.id,
          eventId: session.eventId,
          subjectType: RecipientType.MEMBER,
          subjectId: input.member_id,
          method: AttendanceMethod.MANUAL,
          status: AttendanceStatus.VERIFIED,
          clientUuid: input.client_uuid,
          clientMarkedAt: new Date(),
          verifiedAt: new Date(),
          markedById,
          notes: input.notes,
        },
      });

      await tx.registration.updateMany({
        where: {
          eventId: session.eventId,
          userId: input.member_id,
          status: RegistrationStatus.REGISTERED,
        },
        data: { status: RegistrationStatus.ATTENDED },
      });

      await tx.auditLog.create({
        data: {
          actorId: markedById,
          action: 'ATTENDANCE_MANUAL_OVERRIDE',
          targetType: 'attendance_record',
          targetId: record.id,
          afterJson: {
            session_id: session.id,
            event_id: session.eventId,
            member_id: input.member_id,
            notes: input.notes,
          },
        },
      });

      return this.mapRecord(record);
    });
  }

  /**
   * Reconcile queued offline attendance operations from scanner IndexedDB.
   */
  async syncOfflineOperations(
    input: BatchSyncAttendanceInput,
    markedById: string,
  ): Promise<BatchSyncAttendanceResponse> {
    const results: AttendanceSyncResult[] = [];
    let syncedCount = 0;
    let conflictCount = 0;
    let rejectedCount = 0;

    for (const op of input.operations) {
      try {
        // 1. Idempotency: has this client_uuid already been processed?
        const existing = await this.prisma.attendanceRecord.findUnique({
          where: { clientUuid: op.client_uuid },
        });

        if (existing) {
          results.push({
            client_uuid: op.client_uuid,
            status: existing.status as AttendanceStatus,
            message: 'Already processed (idempotent replay).',
            record_id: existing.id,
          });
          if (existing.status === AttendanceStatus.VERIFIED) syncedCount++;
          else if (existing.status === AttendanceStatus.FLAGGED_CONFLICT) conflictCount++;
          else rejectedCount++;
          continue;
        }

        // 2. Session verification
        const session = await this.prisma.attendanceSession.findUnique({
          where: { id: op.session_id },
        });

        if (!session) {
          results.push({
            client_uuid: op.client_uuid,
            status: AttendanceStatus.REJECTED,
            message: 'Attendance session not found.',
          });
          rejectedCount++;
          continue;
        }

        const clientMarkedAt = new Date(op.client_marked_at);
        const now = new Date();

        // 3. Clock skew verification (flag if client marked at > 24 hours drift)
        const diffMs = Math.abs(now.getTime() - clientMarkedAt.getTime());
        if (diffMs > 24 * 60 * 60 * 1000) {
          let recId: string | undefined;
          if (op.member_id) {
            const existingSkew = await this.prisma.attendanceRecord.findUnique({
              where: {
                session_subject_unique: {
                  sessionId: session.id,
                  subjectType: RecipientType.MEMBER,
                  subjectId: op.member_id,
                },
              },
            });
            if (existingSkew) {
              recId = existingSkew.id;
            } else {
              const created = await this.prisma.attendanceRecord.create({
                data: {
                  sessionId: session.id,
                  eventId: session.eventId,
                  subjectType: RecipientType.MEMBER,
                  subjectId: op.member_id,
                  method: op.method,
                  status: AttendanceStatus.FLAGGED_CONFLICT,
                  clientUuid: op.client_uuid,
                  clientMarkedAt,
                  verifiedAt: now,
                  markedById,
                  notes: `Clock skew warning: Client timestamp deviated by ${Math.round(diffMs / 60000)} minutes.`,
                },
              });
              recId = created.id;
            }
          }
          results.push({
            client_uuid: op.client_uuid,
            status: AttendanceStatus.FLAGGED_CONFLICT,
            message: 'Client clock skew exceeded tolerance window.',
            record_id: recId,
          });
          conflictCount++;
          continue;
        }

        // 4. Resolve member identity based on method
        let targetMemberId = op.member_id;

        if (op.method === AttendanceMethod.QR_SCAN) {
          const qrRes = await this.idCardService.verifyQrPass(op.payload, {
            captureTimestamp: clientMarkedAt,
            maxSyncWindowSec: 24 * 3600,
          });
          if (!qrRes.valid || !qrRes.user_id) {
            results.push({
              client_uuid: op.client_uuid,
              status: AttendanceStatus.REJECTED,
              message: qrRes.message || 'Cryptographic signature verification failed.',
            });
            rejectedCount++;
            continue;
          }
          targetMemberId = qrRes.user_id;
        } else if (op.method === AttendanceMethod.ROTATING_CODE) {
          const plainSecret = decryptAes256Gcm(session.totpSecret, env.APP_ENCRYPTION_KEY);
          const isTotpValid = verifyTotp(
            op.payload,
            plainSecret,
            session.totpStepSeconds,
            2,
            clientMarkedAt.getTime(),
          );
          if (!isTotpValid) {
            results.push({
              client_uuid: op.client_uuid,
              status: AttendanceStatus.REJECTED,
              message: 'ROTATING_CODE invalid for recorded time step.',
            });
            rejectedCount++;
            continue;
          }
        }

        if (!targetMemberId) {
          results.push({
            client_uuid: op.client_uuid,
            status: AttendanceStatus.REJECTED,
            message: 'Missing member identification.',
          });
          rejectedCount++;
          continue;
        }

        // 5. Duplicate check in this session
        const existingSessionRecord = await this.prisma.attendanceRecord.findUnique({
          where: {
            session_subject_unique: {
              sessionId: session.id,
              subjectType: RecipientType.MEMBER,
              subjectId: targetMemberId,
            },
          },
        });

        if (existingSessionRecord) {
          results.push({
            client_uuid: op.client_uuid,
            status: AttendanceStatus.FLAGGED_CONFLICT,
            message: 'Duplicate check-in detected during offline sync reconciliation.',
            record_id: existingSessionRecord.id,
          });
          conflictCount++;
          continue;
        }

        // 6. Centralized Validation Engine: Session status, User active standing, Audience eligibility, Manual notes
        try {
          await this.validateAttendanceCandidate({
            session,
            memberId: targetMemberId,
            method: op.method as AttendanceMethod,
            markedAt: clientMarkedAt,
            isOnline: false,
            notes: op.notes,
          });
        } catch (valErr: unknown) {
          const errMsg =
            valErr instanceof HttpException
              ? ((valErr.getResponse() as { message?: string })?.message ?? valErr.message)
              : (valErr instanceof Error ? valErr.message : 'Validation failed.');
          results.push({
            client_uuid: op.client_uuid,
            status: AttendanceStatus.REJECTED,
            message: errMsg,
          });
          rejectedCount++;
          continue;
        }

        // 7. Record verified attendance & audit log atomically within transaction
        const rec = await this.prisma.$transaction(async (tx) => {
          const created = await tx.attendanceRecord.create({
            data: {
              sessionId: session.id,
              eventId: session.eventId,
              subjectType: RecipientType.MEMBER,
              subjectId: targetMemberId,
              method: op.method,
              status: AttendanceStatus.VERIFIED,
              clientUuid: op.client_uuid,
              clientMarkedAt,
              verifiedAt: now,
              markedById,
              notes: op.notes,
            },
          });

          await tx.registration.updateMany({
            where: {
              eventId: session.eventId,
              userId: targetMemberId,
              status: RegistrationStatus.REGISTERED,
            },
            data: { status: RegistrationStatus.ATTENDED },
          });

          await tx.auditLog.create({
            data: {
              actorId: markedById,
              action:
                op.method === AttendanceMethod.MANUAL
                  ? 'ATTENDANCE_MANUAL_OVERRIDE'
                  : 'ATTENDANCE_RECORDED',
              targetType: 'attendance_record',
              targetId: created.id,
              afterJson: {
                session_id: session.id,
                event_id: session.eventId,
                member_id: targetMemberId,
                method: op.method,
                client_uuid: op.client_uuid,
                sync_mode: 'offline_reconciled',
                notes: op.notes,
              },
            },
          });

          return created;
        });

        results.push({
          client_uuid: op.client_uuid,
          status: AttendanceStatus.VERIFIED,
          message: 'Offline check-in successfully verified and reconciled.',
          record_id: rec.id,
        });
        syncedCount++;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown synchronization error';
        results.push({
          client_uuid: op.client_uuid,
          status: AttendanceStatus.REJECTED,
          message: errorMsg,
        });
        rejectedCount++;
      }
    }

    return {
      synced_count: syncedCount,
      conflict_count: conflictCount,
      rejected_count: rejectedCount,
      results,
    };
  }

  /**
   * Helper: enforce session open and time bounds
   */
  private validateSessionBounds(
    session: { startsAt: Date; endsAt: Date; isOpen: boolean },
    markedAt: Date,
    isOnline: boolean,
  ): void {
    if (!session.isOpen) {
      throw new BadRequestException({
        code: 'SESSION_CLOSED',
        message: 'Attendance session is currently closed.',
      });
    }

    const now = new Date();
    const gracePeriodMs = 30 * 60 * 1000; // 30-minute grace window past endsAt

    if (isOnline) {
      if (now.getTime() > session.endsAt.getTime() + gracePeriodMs) {
        throw new BadRequestException({
          code: 'SESSION_EXPIRED',
          message: 'Attendance session window has concluded.',
        });
      }
    } else {
      if (markedAt.getTime() > session.endsAt.getTime() + gracePeriodMs) {
        throw new BadRequestException({
          code: 'SESSION_EXPIRED',
          message: 'Attendance recorded after session end time.',
        });
      }
    }
  }

  /**
   * Centralized Attendance Validation Engine (TASK-022 / B18 / F07)
   * Enforces unified validation rules across online check-ins (QR, TOTP, Manual)
   * and offline batch synchronization.
   */
  async validateAttendanceCandidate(params: {
    session: { id: string; eventId: string; audience: string; startsAt: Date; endsAt: Date; isOpen: boolean };
    memberId: string;
    method: AttendanceMethod;
    markedAt: Date;
    isOnline: boolean;
    notes?: string;
  }): Promise<{ member: { id: string; status: string } }> {
    const { session, memberId, method, markedAt, isOnline, notes } = params;

    // 1. Session Open & Time Bounds
    this.validateSessionBounds(session, markedAt, isOnline);

    // 2. Active Member Existence & Standing
    const member = await this.prisma.user.findUnique({
      where: { id: memberId },
      select: { id: true, status: true },
    });

    if (!member || member.status !== UserStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'INELIGIBLE_MEMBER',
        message: 'Target member record is not in active standing.',
      });
    }

    // 3. Audience Tier Eligibility
    await this.assertAudienceEligibility(session, memberId, markedAt);

    // 4. Mandatory Manual Notes Validation
    if (method === AttendanceMethod.MANUAL) {
      if (!notes || notes.trim().length < 3) {
        throw new BadRequestException({
          code: 'MISSING_MANUAL_NOTES',
          message: 'Manual attendance override requires a mandatory verification reason (minimum 3 characters).',
        });
      }
    }

    return { member };
  }

  /**
   * Helper: enforce strict audience tier hierarchy and active tenure constraints (TASK-024 / B18 / F09)
   */
  private async assertAudienceEligibility(
    session: { eventId: string; audience: string },
    memberId: string,
    markedAt?: Date,
  ): Promise<void> {
    if (session.audience === AttendanceAudience.ALL) {
      return;
    }

    if (session.audience === AttendanceAudience.PARTICIPANTS) {
      const reg = await this.prisma.registration.findFirst({
        where: {
          eventId: session.eventId,
          userId: memberId,
          status: { in: [...SEAT_CONSUMING_STATUSES] },
        },
      });

      if (!reg) {
        throw new ForbiddenException({
          code: 'INELIGIBLE_AUDIENCE',
          message: 'Member does not hold a confirmed registration for this event.',
        });
      }
      return;
    }

    if (
      session.audience === AttendanceAudience.VOLUNTEERS ||
      session.audience === AttendanceAudience.CORE ||
      session.audience === AttendanceAudience.SUBCORE
    ) {
      const checkTime = markedAt ?? new Date();

      // Filter role assignments by active term boundaries: termStart <= checkTime AND (termEnd IS NULL OR termEnd >= checkTime)
      const activeRoleAssignments = await this.prisma.roleAssignment.findMany({
        where: {
          userId: memberId,
          termStart: { lte: checkTime },
          OR: [
            { termEnd: null },
            { termEnd: { gte: checkTime } },
          ],
        },
        include: { role: true },
      });

      const activeRoleCodes = activeRoleAssignments.map((ra) => ra.role.code as RoleCode);

      let isEligible = false;

      if (session.audience === AttendanceAudience.CORE) {
        // Strict Core tier: Requires active Core role or Executive (Admin, President, VP) in current term
        const coreAllowed: RoleCode[] = [
          RoleCode.CORE,
          RoleCode.PRESIDENT,
          RoleCode.VP,
          RoleCode.ADMIN,
        ];
        isEligible = activeRoleCodes.some((code) => coreAllowed.includes(code));
      } else if (session.audience === AttendanceAudience.SUBCORE) {
        // Subcore tier: Requires active Subcore, Core, or Executive role in current term
        const subcoreAllowed: RoleCode[] = [
          RoleCode.SUBCORE,
          RoleCode.CORE,
          RoleCode.PRESIDENT,
          RoleCode.VP,
          RoleCode.ADMIN,
        ];
        isEligible = activeRoleCodes.some((code) => subcoreAllowed.includes(code));
      } else if (session.audience === AttendanceAudience.VOLUNTEERS) {
        // Volunteers tier: Requires active Committee volunteer, Subcore, Core, or Executive role in current term
        const volunteerAllowed: RoleCode[] = [
          RoleCode.COMMITTEE,
          RoleCode.SUBCORE,
          RoleCode.CORE,
          RoleCode.PRESIDENT,
          RoleCode.VP,
          RoleCode.ADMIN,
        ];
        isEligible = activeRoleCodes.some((code) => volunteerAllowed.includes(code));
      }

      if (!isEligible) {
        throw new ForbiddenException({
          code: 'INELIGIBLE_AUDIENCE',
          message: `Member does not hold an active role in authorized audience tier "${session.audience}".`,
        });
      }
      return;
    }

    // Default deny for unrecognized audience tier
    throw new ForbiddenException({
      code: 'INELIGIBLE_AUDIENCE',
      message: `Unknown or unauthorized audience tier "${session.audience}".`,
    });
  }

  private mapSession(s: {
    id: string;
    eventId: string;
    name: string;
    audience: string;
    startsAt: Date;
    endsAt: Date;
    isOpen: boolean;
    totpStepSeconds: number;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }): AttendanceSession {
    return {
      id: s.id,
      event_id: s.eventId,
      name: s.name,
      audience: s.audience as AttendanceAudience,
      starts_at: s.startsAt.toISOString(),
      ends_at: s.endsAt.toISOString(),
      is_open: s.isOpen,
      totp_step_seconds: s.totpStepSeconds,
      created_by_id: s.createdById,
      created_at: s.createdAt.toISOString(),
      updated_at: s.updatedAt.toISOString(),
    };
  }

  private mapRecord(r: {
    id: string;
    sessionId: string;
    eventId: string;
    subjectType: string;
    subjectId: string;
    method: string;
    status: string;
    clientUuid: string;
    clientMarkedAt: Date;
    verifiedAt: Date;
    markedById: string;
    notes?: string | null;
    createdAt: Date;
  }): AttendanceRecord {
    return {
      id: r.id,
      session_id: r.sessionId,
      event_id: r.eventId,
      subject_type: r.subjectType as RecipientType,
      subject_id: r.subjectId,
      method: r.method as AttendanceMethod,
      status: r.status as AttendanceStatus,
      client_uuid: r.clientUuid,
      client_marked_at: r.clientMarkedAt.toISOString(),
      verified_at: r.verifiedAt.toISOString(),
      marked_by_id: r.markedById,
      notes: r.notes,
      created_at: r.createdAt.toISOString(),
    };
  }
}
