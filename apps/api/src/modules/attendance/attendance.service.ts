import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
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

    if (!session.isOpen) {
      throw new BadRequestException({
        code: 'SESSION_CLOSED',
        message: 'Attendance session is currently closed.',
      });
    }

    // 1. Verify cryptographic QR Pass
    const verifyResult = await this.idCardService.verifyQrPass(input.qr_token);
    if (!verifyResult.valid || !verifyResult.user_id) {
      throw new BadRequestException({
        code: 'INVALID_QR_PASS',
        message: verifyResult.message || 'Cryptographic verification failed for QR pass.',
      });
    }

    const memberId = verifyResult.user_id;

    // 2. Audience eligibility check
    await this.assertAudienceEligibility(session, memberId);

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
          status: 'registered',
        },
        data: { status: 'attended' },
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

    if (!session.isOpen) {
      throw new BadRequestException({
        code: 'SESSION_CLOSED',
        message: 'Attendance session is currently closed.',
      });
    }

    // 1. Verify TOTP code (accept current step +/- 1 step)
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

    // 2. Member existence & active standing
    const member = await this.prisma.user.findUnique({
      where: { id: input.member_id },
    });

    if (!member || member.status !== UserStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'INELIGIBLE_MEMBER',
        message: 'Target member record is not in active standing.',
      });
    }

    // 3. Audience eligibility check
    await this.assertAudienceEligibility(session, input.member_id);

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
          status: 'registered',
        },
        data: { status: 'attended' },
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

    if (!session.isOpen) {
      throw new BadRequestException({
        code: 'SESSION_CLOSED',
        message: 'Attendance session is currently closed.',
      });
    }

    const member = await this.prisma.user.findUnique({
      where: { id: input.member_id },
    });

    if (!member || member.status !== UserStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'INELIGIBLE_MEMBER',
        message: 'Target member record is not in active standing.',
      });
    }

    await this.assertAudienceEligibility(session, input.member_id);

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
          status: 'registered',
        },
        data: { status: 'attended' },
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
          const qrRes = await this.idCardService.verifyQrPass(op.payload);
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

        // 6. Record verified attendance
        const rec = await this.prisma.attendanceRecord.create({
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

        // Update registration status
        await this.prisma.registration.updateMany({
          where: {
            eventId: session.eventId,
            userId: targetMemberId,
            status: 'registered',
          },
          data: { status: 'attended' },
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
   * Helper: enforce audience eligibility constraints
   */
  private async assertAudienceEligibility(
    session: { eventId: string; audience: string },
    memberId: string,
  ): Promise<void> {
    if (session.audience === AttendanceAudience.ALL) {
      return;
    }

    if (session.audience === AttendanceAudience.PARTICIPANTS) {
      const reg = await this.prisma.registration.findFirst({
        where: {
          eventId: session.eventId,
          userId: memberId,
          status: { in: ['registered', 'attended'] },
        },
      });

      if (!reg) {
        throw new ForbiddenException({
          code: 'INELIGIBLE_AUDIENCE',
          message: 'Member does not hold a confirmed registration for this event.',
        });
      }
    } else if (
      session.audience === AttendanceAudience.VOLUNTEERS ||
      session.audience === AttendanceAudience.CORE ||
      session.audience === AttendanceAudience.SUBCORE
    ) {
      const roleAssignments = await this.prisma.roleAssignment.findMany({
        where: { userId: memberId },
        include: { role: true },
      });

      const roleCodes = roleAssignments.map((ra) => ra.role.code);
      const isEligible = roleCodes.some((code) =>
        ['committee', 'subcore', 'core', 'vp', 'president', 'admin'].includes(code),
      );

      if (!isEligible) {
        throw new ForbiddenException({
          code: 'INELIGIBLE_AUDIENCE',
          message: `Member does not belong to authorized audience tier "${session.audience}".`,
        });
      }
    }
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
