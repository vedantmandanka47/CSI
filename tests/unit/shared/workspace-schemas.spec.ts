import { describe, it, expect } from 'vitest';
import {
  CommitteeWorkspaceSummarySchema,
  CommitteeMemberItemSchema,
  CommitteeWorkspaceDetailsSchema,
  WorkspacesListResponseSchema,
  WorkspaceRoleCapabilitiesSchema,
  CommitteeCode,
  ALL_COMMITTEE_CODES,
} from '@csi/shared';

describe('Workspace Schemas & Types (M15)', () => {
  it('should validate WorkspaceRoleCapabilitiesSchema', () => {
    const caps = {
      canTakeAttendance: true,
      canManageAttendance: false,
      canBookVenues: true,
      canCreateEvents: false,
      canGenerateCertificates: false,
      canManageRoster: false,
      canExportData: false,
    };
    const parsed = WorkspaceRoleCapabilitiesSchema.safeParse(caps);
    expect(parsed.success).toBe(true);
  });

  it('should define all 6 canonical committee codes from PE.md', () => {
    expect(ALL_COMMITTEE_CODES).toHaveLength(6);
    expect(ALL_COMMITTEE_CODES).toContain(CommitteeCode.TECHNICAL);
    expect(ALL_COMMITTEE_CODES).toContain(CommitteeCode.DOCUMENTATION);
    expect(ALL_COMMITTEE_CODES).toContain(CommitteeCode.GRAPHICS);
    expect(ALL_COMMITTEE_CODES).toContain(CommitteeCode.PR);
    expect(ALL_COMMITTEE_CODES).toContain(CommitteeCode.MOTION);
    expect(ALL_COMMITTEE_CODES).toContain(CommitteeCode.LOGISTICS);
  });

  it('should validate a valid CommitteeWorkspaceSummary', () => {
    const valid = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      code: 'technical',
      name: 'Technical Committee',
      description: 'Oversees technical infrastructure and workshops',
      userRole: 'core',
      userRoleName: 'Core Committee Head',
      termStart: '2026-08-01T00:00:00.000Z',
      termEnd: null,
      isExecutiveOversight: false,
    };

    const parsed = CommitteeWorkspaceSummarySchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('should reject a CommitteeWorkspaceSummary with invalid UUID', () => {
    const invalid = {
      id: 'not-a-uuid',
      code: 'technical',
      name: 'Technical Committee',
      description: 'Oversees technical infrastructure',
      userRole: 'core',
      userRoleName: 'Core Committee Head',
      termStart: '2026-08-01T00:00:00.000Z',
      isExecutiveOversight: false,
    };

    const parsed = CommitteeWorkspaceSummarySchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('should validate a CommitteeMemberItem', () => {
    const member = {
      userId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      name: 'Aarav Patel',
      email: 'aarav.patel@gcet.edu.in',
      roleCode: 'subcore',
      roleName: 'Sub-Core Executive',
      branch: 'Computer Engineering',
      year: 3,
      avatarUrl: null,
      termStart: '2026-08-01T00:00:00.000Z',
      termEnd: '2027-05-31T00:00:00.000Z',
      isActive: true,
    };

    const parsed = CommitteeMemberItemSchema.safeParse(member);
    expect(parsed.success).toBe(true);
  });

  it('should reject a CommitteeMemberItem with invalid email', () => {
    const invalidMember = {
      userId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      name: 'Aarav Patel',
      email: 'not-an-email',
      roleCode: 'subcore',
      roleName: 'Sub-Core Executive',
      termStart: '2026-08-01T00:00:00.000Z',
      isActive: true,
    };

    const parsed = CommitteeMemberItemSchema.safeParse(invalidMember);
    expect(parsed.success).toBe(false);
  });

  it('should validate full CommitteeWorkspaceDetails payload', () => {
    const details = {
      committee: {
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        code: 'technical',
        name: 'Technical Committee',
        description: 'Technical infrastructure and development',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      currentUserAccess: {
        roleCode: 'core',
        roleName: 'Core Committee Head',
        termStart: '2026-08-01T00:00:00.000Z',
        termEnd: null,
        isExecutive: false,
        permissions: ['workspace.technical', 'attendance.manage'],
        capabilities: {
          canTakeAttendance: true,
          canManageAttendance: true,
          canBookVenues: true,
          canCreateEvents: true,
          canGenerateCertificates: true,
          canManageRoster: false,
          canExportData: true,
        },
      },
      metrics: {
        totalMembers: 12,
        coreHeads: 2,
        subcoreExecutives: 4,
        committeeVolunteers: 6,
        activeEventsCount: 3,
      },
      members: [
        {
          userId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          name: 'Aarav Patel',
          email: 'aarav.patel@gcet.edu.in',
          roleCode: 'core',
          roleName: 'Core Committee Head',
          branch: 'Computer Engineering',
          year: 4,
          termStart: '2026-08-01T00:00:00.000Z',
          isActive: true,
        },
      ],
      recentEvents: [
        {
          id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
          slug: 'ai-workshop-2026',
          title: 'Advanced AI Workshop',
          category: 'workshop',
          startsAt: '2026-11-15T10:00:00.000Z',
          endsAt: '2026-11-15T16:00:00.000Z',
          state: 'published',
          venueName: 'Lab 3',
        },
      ],
      activeSessions: [
        {
          id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
          eventId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
          eventTitle: 'Advanced AI Workshop',
          sessionType: 'Morning Session',
          status: 'open',
          createdAt: '2026-11-15T09:30:00.000Z',
        },
      ],
    };

    const parsed = CommitteeWorkspaceDetailsSchema.safeParse(details);
    expect(parsed.success).toBe(true);
  });

  it('should validate WorkspacesListResponse with multiple workspaces', () => {
    const list = {
      workspaces: [
        {
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          code: 'technical',
          name: 'Technical Committee',
          description: 'Tech operations',
          userRole: 'core',
          userRoleName: 'Core Committee Head',
          termStart: '2026-08-01T00:00:00.000Z',
          isExecutiveOversight: false,
        },
        {
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          code: 'logistics',
          name: 'Logistics & Operations',
          description: 'Logistics team',
          userRole: 'committee',
          userRoleName: 'Committee Volunteer',
          termStart: '2026-08-01T00:00:00.000Z',
          isExecutiveOversight: false,
        },
      ],
      isExecutive: false,
      primaryWorkspace: {
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        code: 'technical',
        name: 'Technical Committee',
        description: 'Tech operations',
        userRole: 'core',
        userRoleName: 'Core Committee Head',
        termStart: '2026-08-01T00:00:00.000Z',
        isExecutiveOversight: false,
      },
    };

    const parsed = WorkspacesListResponseSchema.safeParse(list);
    expect(parsed.success).toBe(true);
  });
});
