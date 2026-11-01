import { z } from 'zod';

/**
 * Role-derived operational capabilities for the active workspace context
 */
export const WorkspaceRoleCapabilitiesSchema = z.object({
  canTakeAttendance: z.boolean(),
  canManageAttendance: z.boolean(),
  canBookVenues: z.boolean(),
  canCreateEvents: z.boolean(),
  canGenerateCertificates: z.boolean(),
  canManageRoster: z.boolean(),
  canExportData: z.boolean(),
});

export type WorkspaceRoleCapabilities = z.infer<typeof WorkspaceRoleCapabilitiesSchema>;

/**
 * Summary of a committee workspace accessible to a user
 */
export const CommitteeWorkspaceSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  userRole: z.string(),
  userRoleName: z.string(),
  termStart: z.string(),
  termEnd: z.string().nullable().optional(),
  isExecutiveOversight: z.boolean(),
});

export type CommitteeWorkspaceSummary = z.infer<typeof CommitteeWorkspaceSummarySchema>;

/**
 * Member record in a committee roster
 */
export const CommitteeMemberItemSchema = z.object({
  userId: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  roleCode: z.string(),
  roleName: z.string(),
  branch: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  termStart: z.string(),
  termEnd: z.string().nullable().optional(),
  isActive: z.boolean(),
});

export type CommitteeMemberItem = z.infer<typeof CommitteeMemberItemSchema>;

/**
 * Event affiliated with a committee
 */
export const CommitteeWorkspaceEventSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  category: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  state: z.string(),
  venueName: z.string().nullable().optional(),
});

export type CommitteeWorkspaceEvent = z.infer<typeof CommitteeWorkspaceEventSchema>;

/**
 * Active attendance session in the branch
 */
export const CommitteeWorkspaceSessionSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  eventTitle: z.string(),
  sessionType: z.string(),
  status: z.string(),
  createdAt: z.string(),
});

export type CommitteeWorkspaceSession = z.infer<typeof CommitteeWorkspaceSessionSchema>;

/**
 * Full details of a dedicated committee workspace
 */
export const CommitteeWorkspaceDetailsSchema = z.object({
  committee: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    description: z.string(),
    createdAt: z.string(),
  }),
  currentUserAccess: z.object({
    roleCode: z.string(),
    roleName: z.string(),
    termStart: z.string(),
    termEnd: z.string().nullable().optional(),
    isExecutive: z.boolean(),
    permissions: z.array(z.string()),
    capabilities: WorkspaceRoleCapabilitiesSchema,
  }),
  metrics: z.object({
    totalMembers: z.number(),
    coreHeads: z.number(),
    subcoreExecutives: z.number(),
    committeeVolunteers: z.number(),
    activeEventsCount: z.number(),
  }),
  members: z.array(CommitteeMemberItemSchema),
  recentEvents: z.array(CommitteeWorkspaceEventSchema),
  activeSessions: z.array(CommitteeWorkspaceSessionSchema),
});

export type CommitteeWorkspaceDetails = z.infer<typeof CommitteeWorkspaceDetailsSchema>;

/**
 * Response payload for GET /api/me/workspaces
 */
export const WorkspacesListResponseSchema = z.object({
  workspaces: z.array(CommitteeWorkspaceSummarySchema),
  isExecutive: z.boolean(),
  primaryWorkspace: CommitteeWorkspaceSummarySchema.nullable(),
});

export type WorkspacesListResponse = z.infer<typeof WorkspacesListResponseSchema>;
