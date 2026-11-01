import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  RoleCode,
  PermissionCode,
  ErrorCode,
  hasPermission,
  CommitteeWorkspaceSummary,
  CommitteeWorkspaceDetails,
  CommitteeMemberItem,
  CommitteeWorkspaceEvent,
  CommitteeWorkspaceSession,
  WorkspacesListResponse,
  WorkspaceRoleCapabilities,
} from '@csi/shared';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Format internal role codes into user-friendly display titles
   */
  private formatRoleName(roleCode: string): string {
    switch (roleCode) {
      case RoleCode.PRESIDENT:
        return 'President';
      case RoleCode.VP:
        return 'Vice President';
      case RoleCode.ADMIN:
        return 'System Administrator';
      case RoleCode.CORE:
        return 'Core Committee Head';
      case RoleCode.SUBCORE:
        return 'Sub-Core Executive';
      case RoleCode.COMMITTEE:
        return 'Committee Volunteer';
      case RoleCode.FACULTY:
        return 'Faculty Advisor';
      case RoleCode.MEMBER:
        return 'Branch Member';
      default:
        return roleCode.charAt(0).toUpperCase() + roleCode.slice(1);
    }
  }

  /**
   * Derive operational capabilities from the user's effective roles/permissions
   */
  private deriveCapabilities(roles: RoleCode[]): WorkspaceRoleCapabilities {
    return {
      canTakeAttendance: hasPermission(roles, PermissionCode.ATTENDANCE_TAKE),
      canManageAttendance: hasPermission(roles, PermissionCode.ATTENDANCE_MANAGE),
      canBookVenues: hasPermission(roles, PermissionCode.VENUE_BOOK),
      canCreateEvents: hasPermission(roles, PermissionCode.EVENT_CREATE),
      canGenerateCertificates: hasPermission(roles, PermissionCode.CERT_GENERATE),
      canManageRoster: hasPermission(roles, PermissionCode.ROSTER_MANAGE),
      canExportData: hasPermission(roles, PermissionCode.EXPORT_DATA),
    };
  }

  /**
   * Retrieve all committee workspaces accessible to the authenticated user.
   * Executive roles (President, VP, Admin) have branch-wide oversight across all committees.
   * Committee members receive access strictly to their actively assigned committees.
   */
  async getMyWorkspaces(userId: string, userRoles: RoleCode[]): Promise<WorkspacesListResponse> {
    const isExecutive =
      userRoles.includes(RoleCode.PRESIDENT) ||
      userRoles.includes(RoleCode.VP) ||
      userRoles.includes(RoleCode.ADMIN);

    const now = new Date();

    if (isExecutive) {
      const allCommittees = await this.prisma.committee.findMany({
        orderBy: { code: 'asc' },
      });

      const executiveRole =
        userRoles.find(
          (r) => r === RoleCode.ADMIN || r === RoleCode.PRESIDENT || r === RoleCode.VP,
        ) || RoleCode.ADMIN;

      const workspaces: CommitteeWorkspaceSummary[] = allCommittees.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        description: c.description,
        userRole: executiveRole,
        userRoleName: this.formatRoleName(executiveRole),
        termStart: now.toISOString(),
        termEnd: null,
        isExecutiveOversight: true,
      }));

      const primary = workspaces.length > 0 ? workspaces[0] : null;

      return {
        workspaces,
        isExecutive: true,
        primaryWorkspace: primary ?? null,
      };
    }

    // Non-executive users: retrieve active committee assignments
    const activeAssignments = await this.prisma.roleAssignment.findMany({
      where: {
        userId,
        committeeId: { not: null },
        termStart: { lte: now },
        OR: [{ termEnd: null }, { termEnd: { gte: now } }],
        role: {
          code: { in: [RoleCode.CORE, RoleCode.SUBCORE, RoleCode.COMMITTEE] },
        },
      },
      include: {
        committee: true,
        role: true,
      },
      orderBy: { termStart: 'desc' },
    });

    // Deduplicate by committee id (preserving most senior role if multiple)
    const seenCommittees = new Set<string>();
    const workspaces: CommitteeWorkspaceSummary[] = [];

    for (const assignment of activeAssignments) {
      if (assignment.committee && !seenCommittees.has(assignment.committee.id)) {
        seenCommittees.add(assignment.committee.id);
        workspaces.push({
          id: assignment.committee.id,
          code: assignment.committee.code,
          name: assignment.committee.name,
          description: assignment.committee.description,
          userRole: assignment.role.code,
          userRoleName: this.formatRoleName(assignment.role.code),
          termStart: assignment.termStart.toISOString(),
          termEnd: assignment.termEnd ? assignment.termEnd.toISOString() : null,
          isExecutiveOversight: false,
        });
      }
    }

    const primary = workspaces.length > 0 ? workspaces[0] : null;

    return {
      workspaces,
      isExecutive: false,
      primaryWorkspace: primary ?? null,
    };
  }

  /**
   * Validate user access to a committee workspace based on membership tenure or executive oversight.
   * Throws 404 if committee does not exist.
   * Throws 403 if user is not authorized or tenure is expired / not started.
   */
  async validateCommitteeAccess(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
  ): Promise<{
    committee: { id: string; code: string; name: string; description: string; createdAt: Date };
    isExecutive: boolean;
    activeRoleCode: string;
    activeTermStart: string;
    activeTermEnd: string | null;
  }> {
    const code = committeeCode.toLowerCase().trim();
    const now = new Date();

    const committee = await this.prisma.committee.findUnique({
      where: { code },
    });

    if (!committee) {
      throw new NotFoundException({
        code: ErrorCode.COMMITTEE_NOT_FOUND,
        message: `Committee '${committeeCode}' not found`,
      });
    }

    const isExecutive =
      userRoles.includes(RoleCode.PRESIDENT) ||
      userRoles.includes(RoleCode.VP) ||
      userRoles.includes(RoleCode.ADMIN);

    let activeRoleCode: string = isExecutive
      ? (userRoles.find((r) => r === RoleCode.ADMIN || r === RoleCode.PRESIDENT || r === RoleCode.VP) ?? RoleCode.ADMIN)
      : RoleCode.MEMBER;
    let activeTermStart = now.toISOString();
    let activeTermEnd: string | null = null;

    if (!isExecutive) {
      // Find role assignments for this user in this committee
      const assignments = await this.prisma.roleAssignment.findMany({
        where: {
          userId,
          committeeId: committee.id,
          role: {
            code: { in: [RoleCode.CORE, RoleCode.SUBCORE, RoleCode.COMMITTEE] },
          },
        },
        include: { role: true },
        orderBy: { termStart: 'desc' },
      });

      if (assignments.length === 0) {
        throw new ForbiddenException({
          code: ErrorCode.WORKSPACE_ACCESS_DENIED,
          message: `Access denied: You do not have permission to access the ${committee.name} workspace`,
        });
      }

      // Check tenure states
      const activeAssignment = assignments.find(
        (a) => a.termStart <= now && (!a.termEnd || a.termEnd >= now),
      );

      if (!activeAssignment) {
        // Check if future tenure
        const futureAssignment = assignments.find((a) => a.termStart > now);
        if (futureAssignment) {
          throw new ForbiddenException({
            code: ErrorCode.COMMITTEE_TENURE_NOT_STARTED,
            message: `Your tenure for ${committee.name} has not started yet (begins on ${futureAssignment.termStart.toISOString()})`,
          });
        }

        // All assignments are expired
        const expiredAssignment = assignments[0];
        const expiryStr = expiredAssignment?.termEnd
          ? expiredAssignment.termEnd.toISOString()
          : 'the scheduled end date';

        throw new ForbiddenException({
          code: ErrorCode.COMMITTEE_TENURE_EXPIRED,
          message: `Your tenure for ${committee.name} expired on ${expiryStr}`,
        });
      }

      // Check user account status
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user || user.status !== 'active') {
        throw new ForbiddenException({
          code: ErrorCode.ACCOUNT_DEACTIVATED,
          message: 'Your account is not active',
        });
      }

      activeRoleCode = activeAssignment.role.code;
      activeTermStart = activeAssignment.termStart.toISOString();
      activeTermEnd = activeAssignment.termEnd ? activeAssignment.termEnd.toISOString() : null;
    }

    return {
      committee,
      isExecutive,
      activeRoleCode,
      activeTermStart,
      activeTermEnd,
    };
  }

  /**
   * Retrieve the full workspace details for a specific committee.
   * Validates committee existence, active tenure, and cross-committee boundary permissions.
   */
  async getWorkspaceDetails(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    ip?: string,
  ): Promise<CommitteeWorkspaceDetails> {
    const {
      committee,
      isExecutive,
      activeRoleCode,
      activeTermStart,
      activeTermEnd,
    } = await this.validateCommitteeAccess(userId, userRoles, committeeCode);

    const now = new Date();

    // Audit log workspace access
    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'workspace.accessed',
          targetType: 'committee',
          targetId: committee.id,
          actorId: userId,
          afterJson: { committeeCode: committee.code, role: activeRoleCode, isExecutive },
          ip: ip ?? null,
        },
      });
    } catch {
      // Audit log creation failure should not block legitimate workspace viewing
    }

    // Retrieve committee members
    const allAssignments = await this.prisma.roleAssignment.findMany({
      where: {
        committeeId: committee.id,
      },
      include: {
        user: true,
        role: true,
      },
      orderBy: { termStart: 'desc' },
    });

    const members: CommitteeMemberItem[] = allAssignments.map((ra) => {
      const isActive =
        ra.termStart <= now &&
        (!ra.termEnd || ra.termEnd >= now) &&
        ra.user.status === 'active';

      return {
        userId: ra.user.id,
        name: ra.user.name,
        email: ra.user.email,
        roleCode: ra.role.code,
        roleName: this.formatRoleName(ra.role.code),
        branch: ra.user.branch,
        year: ra.user.year,
        avatarUrl: ra.user.photo,
        termStart: ra.termStart.toISOString(),
        termEnd: ra.termEnd ? ra.termEnd.toISOString() : null,
        isActive,
      };
    });

    // Sort members: active first, then by role seniority (core > subcore > committee > other), then name
    const roleRank: Record<string, number> = {
      [RoleCode.CORE]: 1,
      [RoleCode.SUBCORE]: 2,
      [RoleCode.COMMITTEE]: 3,
    };

    members.sort((a, b) => {
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }
      const rankA = roleRank[a.roleCode] ?? 99;
      const rankB = roleRank[b.roleCode] ?? 99;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return a.name.localeCompare(b.name);
    });

    // Metrics computation
    const activeMembers = members.filter((m) => m.isActive);
    const uniqueActiveUserIds = new Set(activeMembers.map((m) => m.userId));

    const coreHeads = activeMembers.filter((m) => m.roleCode === RoleCode.CORE).length;
    const subcoreExecutives = activeMembers.filter((m) => m.roleCode === RoleCode.SUBCORE).length;
    const committeeVolunteers = activeMembers.filter((m) => m.roleCode === RoleCode.COMMITTEE).length;

    // Retrieve recent and upcoming events
    const events = await this.prisma.event.findMany({
      where: {
        state: { not: 'cancelled' },
      },
      include: {
        venue: true,
      },
      orderBy: { startsAt: 'desc' },
      take: 8,
    });

    const recentEvents: CommitteeWorkspaceEvent[] = events.map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      category: e.category,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      state: e.state,
      venueName: e.venue?.name ?? null,
    }));

    // Retrieve active open attendance sessions
    const openSessions = await this.prisma.attendanceSession.findMany({
      where: { isOpen: true },
      include: { event: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const activeSessions: CommitteeWorkspaceSession[] = openSessions.map((s) => ({
      id: s.id,
      eventId: s.eventId,
      eventTitle: s.event.title,
      sessionType: s.name,
      status: s.isOpen ? 'open' : 'closed',
      createdAt: s.createdAt.toISOString(),
    }));

    const capabilities = this.deriveCapabilities(userRoles);

    return {
      committee: {
        id: committee.id,
        code: committee.code,
        name: committee.name,
        description: committee.description,
        createdAt: committee.createdAt.toISOString(),
      },
      currentUserAccess: {
        roleCode: activeRoleCode,
        roleName: this.formatRoleName(activeRoleCode),
        termStart: activeTermStart,
        termEnd: activeTermEnd,
        isExecutive,
        permissions: userRoles.map((r) => r.toString()),
        capabilities,
      },
      metrics: {
        totalMembers: uniqueActiveUserIds.size,
        coreHeads,
        subcoreExecutives,
        committeeVolunteers,
        activeEventsCount: recentEvents.filter((e) => new Date(e.endsAt) >= now).length,
      },
      members,
      recentEvents,
      activeSessions,
    };
  }

  /**
   * Retrieve members roster for a specific committee workspace
   */
  async getWorkspaceMembers(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
  ): Promise<{ members: CommitteeMemberItem[] }> {
    const details = await this.getWorkspaceDetails(userId, userRoles, committeeCode);
    return { members: details.members };
  }

  /**
   * Retrieve operational events and open attendance sessions for a committee workspace
   */
  async getWorkspaceEvents(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
  ): Promise<{ events: CommitteeWorkspaceEvent[]; activeSessions: CommitteeWorkspaceSession[] }> {
    const details = await this.getWorkspaceDetails(userId, userRoles, committeeCode);
    return {
      events: details.recentEvents,
      activeSessions: details.activeSessions,
    };
  }
}
