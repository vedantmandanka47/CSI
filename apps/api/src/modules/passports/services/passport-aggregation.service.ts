import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { CertificateStorageService } from '../../certificates/storage/certificate-storage.service.js';
import {
  StudentPassportResponse,
  PassportActivityItem,
  PassportActivityType,
  PassportActivityCategory,
  CertificateStatus,
  RoleCode,
  ErrorCode,
} from '@csi/shared';

@Injectable()
export class PassportAggregationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly certificateStorageService: CertificateStorageService,
  ) {}

  /**
   * Aggregates all verified extracurricular activities for a given student.
   * Enforces strict verification boundaries:
   * - Registrations without attendance are excluded.
   * - Only verified attendance records are included.
   * - Only active, generated certificates are included (revoked ones excluded).
   * - Certificate file availability is checked against storage.
   * - Committee responsibilities are derived from authoritative role assignments.
   */
  async getStudentPassport(userId: string): Promise<StudentPassportResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        enrollmentNo: true,
        branch: true,
        year: true,
        status: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: `Student with ID '${userId}' was not found.`,
      });
    }

    // 1. Query Verified Attendance Records
    const attendanceRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        subjectId: user.id,
        subjectType: 'member',
        status: 'verified',
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            category: true,
            startsAt: true,
            endsAt: true,
          },
        },
        session: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        verifiedAt: 'desc',
      },
    });

    // Deduplicate event attendances if student attended multiple sessions of the same event
    const seenEventIds = new Set<string>();
    const uniqueAttendanceRecords: typeof attendanceRecords = [];
    for (const record of attendanceRecords) {
      if (!seenEventIds.has(record.eventId)) {
        seenEventIds.add(record.eventId);
        uniqueAttendanceRecords.push(record);
      }
    }

    // 2. Query Verified Certificates (only GENERATED, excluding REVOKED, PENDING, FAILED)
    const certificates = await this.prisma.certificate.findMany({
      where: {
        OR: [
          { recipientId: user.id },
          { recipientEmail: user.email.toLowerCase() },
        ],
        status: CertificateStatus.GENERATED,
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            category: true,
          },
        },
      },
      orderBy: {
        issuedAt: 'desc',
      },
    });

    const now = new Date();

    // 3. Query Verified Committee Role Assignments (Committee Tenures)
    // Only includes tenures that have commenced (termStart <= now). Future terms are excluded.
    const rawRoleAssignments = await this.prisma.roleAssignment.findMany({
      where: {
        userId: user.id,
        termStart: {
          lte: now,
        },
        OR: [
          { committeeId: { not: null } },
          {
            role: {
              code: {
                in: [
                  RoleCode.PRESIDENT,
                  RoleCode.VP,
                  RoleCode.CORE,
                  RoleCode.SUBCORE,
                  RoleCode.COMMITTEE,
                ],
              },
            },
          },
        ],
      },
      include: {
        role: {
          select: {
            code: true,
            name: true,
          },
        },
        committee: {
          select: {
            code: true,
            name: true,
          },
        },
      },
      orderBy: {
        termStart: 'desc',
      },
    });

    // Deduplicate and filter out unrelated non-student or unassigned member roles
    const seenRoleAssignments = new Set<string>();
    const roleAssignments: typeof rawRoleAssignments = [];

    for (const ra of rawRoleAssignments) {
      if (
        ra.role.code === RoleCode.ADMIN ||
        ra.role.code === RoleCode.FACULTY ||
        ra.role.code === RoleCode.GUEST ||
        ra.role.code === RoleCode.EVENT_GUEST
      ) {
        continue;
      }

      // General member without committee assignment is general membership, not committee tenure
      if (ra.role.code === RoleCode.MEMBER && !ra.committeeId && !ra.committee) {
        continue;
      }

      // Committee role without committee is invalid
      if (ra.role.code === RoleCode.COMMITTEE && !ra.committeeId && !ra.committee) {
        continue;
      }

      // Deduplicate by role + committee + tenure year
      const yearKey = ra.termStart.getUTCFullYear();
      const commKey = ra.committeeId ?? ra.committee?.code ?? 'branch';
      const dedupeKey = `${ra.role.code}:${commKey}:${yearKey}`;
      if (seenRoleAssignments.has(dedupeKey)) {
        continue;
      }
      seenRoleAssignments.add(dedupeKey);
      roleAssignments.push(ra);
    }

    // 4. Query Latest Generated Passport Snapshot
    const latestPassport = await this.prisma.passport.findFirst({
      where: {
        userId: user.id,
      },
      orderBy: {
        generatedAt: 'desc',
      },
    });

    // 5. Build Aggregated Activity Items
    const activities: PassportActivityItem[] = [];

    // Map Committee Roles
    for (const ra of roleAssignments) {
      const isLeadership =
        ra.role.code === RoleCode.PRESIDENT ||
        ra.role.code === RoleCode.VP ||
        ra.role.code === RoleCode.CORE ||
        ra.role.code === RoleCode.SUBCORE;

      activities.push({
        id: `role-${ra.id}`,
        type: PassportActivityType.COMMITTEE_ROLE,
        title: ra.committee ? `${ra.role.name} — ${ra.committee.name}` : ra.role.name,
        category: isLeadership ? PassportActivityCategory.LEADERSHIP : PassportActivityCategory.COMMUNITY,
        date: ra.termStart.toISOString().split('T')[0] ?? '',
        details: ra.committee ? `Committee: ${ra.committee.name}` : `Role: ${ra.role.name}`,
        verificationStatus: 'verified',
        tenureStart: ra.termStart.toISOString(),
        tenureEnd: ra.termEnd ? ra.termEnd.toISOString() : null,
        roleName: ra.role.name,
        committeeName: ra.committee?.name,
      });
    }

    // Map Verified Certificates
    for (const cert of certificates) {
      const fileAvailable = cert.storagePath
        ? this.certificateStorageService.hasCertificatePdf(cert.storagePath)
        : false;

      let cat: PassportActivityCategory = PassportActivityCategory.WORKSHOP;
      if (cert.certificateType === 'merit') {
        cat = PassportActivityCategory.COMPETITION;
      } else if (cert.event.category === 'hackathon') {
        cat = PassportActivityCategory.HACKATHON;
      } else if (cert.event.category === 'competition') {
        cat = PassportActivityCategory.COMPETITION;
      } else if (cert.event.category === 'seminar') {
        cat = PassportActivityCategory.SEMINAR;
      }

      activities.push({
        id: `cert-${cert.id}`,
        type: PassportActivityType.CERTIFICATE,
        title: cert.achievement
          ? `${cert.event.title} (${cert.achievement})`
          : `${cert.certificateType.toUpperCase()} Certificate — ${cert.event.title}`,
        category: cat,
        date: cert.issueDate || (cert.issuedAt ? cert.issuedAt.toISOString().split('T')[0] ?? '' : ''),
        details: `Certificate Number: ${cert.certificateNumber}`,
        verificationStatus: 'verified',
        verifiedAt: cert.issuedAt ? cert.issuedAt.toISOString() : undefined,
        certificateNumber: cert.certificateNumber,
        certificateType: cert.certificateType,
        certificateFileAvailable: fileAvailable,
      });
    }

    // Map Verified Event Attendances
    for (const rec of uniqueAttendanceRecords) {
      let cat: PassportActivityCategory = PassportActivityCategory.WORKSHOP;
      if (rec.event.category === 'hackathon') {
        cat = PassportActivityCategory.HACKATHON;
      } else if (rec.event.category === 'competition') {
        cat = PassportActivityCategory.COMPETITION;
      } else if (rec.event.category === 'seminar') {
        cat = PassportActivityCategory.SEMINAR;
      }

      activities.push({
        id: `att-${rec.id}`,
        type: PassportActivityType.EVENT_ATTENDANCE,
        title: rec.event.title,
        category: cat,
        date: rec.event.startsAt.toISOString().split('T')[0] ?? '',
        details: `Verified check-in via ${rec.method.replace('_', ' ')} (${rec.session.name})`,
        verificationStatus: 'verified',
        verifiedAt: rec.verifiedAt.toISOString(),
      });
    }

    // Sort all activities chronologically descending
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Compute Summary Counts
    const summary = {
      eventsAttended: uniqueAttendanceRecords.length,
      certificatesEarned: certificates.length,
      committeeTenures: roleAssignments.length,
      totalActivities: activities.length,
    };

    return {
      student: {
        id: user.id,
        name: user.name,
        email: user.email,
        enrollmentNo: user.enrollmentNo,
        branch: user.branch,
        year: user.year,
        status: user.status,
      },
      summary,
      activities,
      latestPassport: latestPassport
        ? {
            id: latestPassport.id,
            passportNumber: latestPassport.passportNumber,
            status: latestPassport.status,
            generatedAt: latestPassport.generatedAt.toISOString(),
            hasFile: Boolean(latestPassport.storagePath),
          }
        : null,
    };
  }
}
