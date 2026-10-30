import { z } from 'zod';
import { EventState, RegistrationStatus } from '../enums/domain.enum.js';
import { PaginationQuerySchema, createPaginatedResponseSchema, createSingleResponseSchema } from './common.schema.js';

export const EventCategory = {
  WORKSHOP: 'workshop',
  SEMINAR: 'seminar',
  HACKATHON: 'hackathon',
  COMPETITION: 'competition',
  CULTURAL: 'cultural',
  TECH_TALK: 'tech_talk',
  OTHER: 'other',
} as const;

export type EventCategory = (typeof EventCategory)[keyof typeof EventCategory];

export const VenueSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  capacity: z.number().int().positive(),
  map_url: z.string().url().nullable().optional(),
});

export type VenueSummary = z.infer<typeof VenueSummarySchema>;

export const PublicEventSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  registration_opens_at: z.string().datetime().nullable().optional(),
  registration_closes_at: z.string().datetime().nullable().optional(),
  capacity: z.number().int().positive(),
  state: z.nativeEnum(EventState),
  poster_url: z.string().nullable().optional(),
  venue: VenueSummarySchema.nullable().optional(),
  registered_count: z.number().int().nonnegative(),
  remaining_capacity: z.number().int().nonnegative(),
  is_full: z.boolean(),
  is_registration_open: z.boolean(),
});

export type PublicEventSummary = z.infer<typeof PublicEventSummarySchema>;

export const PublicEventDetailSchema = PublicEventSummarySchema.extend({
  user_registration_status: z.nativeEnum(RegistrationStatus).nullable().optional(),
});

export type PublicEventDetail = z.infer<typeof PublicEventDetailSchema>;

export const EventListQuerySchema = PaginationQuerySchema.extend({
  category: z.string().optional(),
  status: z.enum(['upcoming', 'past', 'all']).default('upcoming').optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type EventListQuery = z.infer<typeof EventListQuerySchema>;

export const EventRegisterSchema = z.object({
  notes: z.string().max(255).optional(),
});

export type EventRegisterInput = z.infer<typeof EventRegisterSchema>;

export const GuestRegisterSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  college: z.string().trim().min(2, 'College name must be at least 2 characters').max(150),
  phone: z.string().trim().regex(/^[0-9+ -]{8,20}$/, 'Invalid phone number format'),
  consent_data_processing: z.literal(true, {
    errorMap: () => ({ message: 'Consent to data processing is required' }),
  }),
});

export type GuestRegisterInput = z.infer<typeof GuestRegisterSchema>;

export const RegistrationResponseSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  user_id: z.string().uuid().nullable().optional(),
  guest_id: z.string().uuid().nullable().optional(),
  status: z.nativeEnum(RegistrationStatus),
  registered_at: z.string().datetime(),
  cancelled_at: z.string().datetime().nullable().optional(),
  message: z.string(),
});

export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>;

export const PaginatedEventsResponseSchema = createPaginatedResponseSchema(PublicEventSummarySchema);
export const SingleEventResponseSchema = createSingleResponseSchema(PublicEventDetailSchema);
export const SingleRegistrationResponseSchema = createSingleResponseSchema(RegistrationResponseSchema);
