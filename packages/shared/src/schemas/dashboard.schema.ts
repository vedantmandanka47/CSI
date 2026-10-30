import { z } from 'zod';
import { createSingleResponseSchema } from './common.schema.js';

export const DashboardProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  enrollment_no: z.string().nullable(),
  email: z.string().email(),
  branch: z.string().nullable(),
  year: z.number().int().nullable(),
  status: z.string(),
  roles: z.array(z.string()),
  valid_until: z.string(),
});

export type DashboardProfile = z.infer<typeof DashboardProfileSchema>;

export const DashboardStatisticsSchema = z.object({
  total_registered_events: z.number().int().nonnegative(),
  attended_events_count: z.number().int().nonnegative(),
  attendance_percentage: z.number().nonnegative(),
  certificates_count: z.number().int().nonnegative(),
});

export type DashboardStatistics = z.infer<typeof DashboardStatisticsSchema>;

export const DashboardUpcomingEventSchema = z.object({
  registration_id: z.string().uuid(),
  event_id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  category: z.string(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  venue_name: z.string().nullable(),
  status: z.string(),
});

export type DashboardUpcomingEvent = z.infer<typeof DashboardUpcomingEventSchema>;

export const DashboardPastRegistrationSchema = z.object({
  registration_id: z.string().uuid(),
  event_id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  starts_at: z.string().datetime(),
  registered_at: z.string().datetime(),
  attendance_status: z.enum(['attended', 'absent', 'excused']),
});

export type DashboardPastRegistration = z.infer<typeof DashboardPastRegistrationSchema>;

export const DashboardActivityItemSchema = z.object({
  id: z.string(),
  type: z.enum(['registration', 'attendance', 'membership']),
  title: z.string(),
  description: z.string(),
  timestamp: z.string().datetime(),
});

export type DashboardActivityItem = z.infer<typeof DashboardActivityItemSchema>;

export const MemberDashboardDataSchema = z.object({
  profile: DashboardProfileSchema,
  statistics: DashboardStatisticsSchema,
  upcoming_events: z.array(DashboardUpcomingEventSchema),
  past_registrations: z.array(DashboardPastRegistrationSchema),
  recent_activity: z.array(DashboardActivityItemSchema),
});

export type MemberDashboardData = z.infer<typeof MemberDashboardDataSchema>;

export const SingleMemberDashboardResponseSchema = createSingleResponseSchema(MemberDashboardDataSchema);

