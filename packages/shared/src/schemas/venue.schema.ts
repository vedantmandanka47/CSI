import { z } from 'zod';
import { AvCapability } from '../enums/domain.enum.js';

export const AvCapabilitySchema = z.nativeEnum(AvCapability);

export const CreateVenueSchema = z.object({
  name: z.string().trim().min(2, 'Venue name must be at least 2 characters.').max(100),
  description: z.string().trim().max(2000).optional().nullable(),
  building: z.string().trim().min(2, 'Building must be specified.').max(100),
  room_number: z.string().trim().max(50).optional().nullable(),
  capacity: z.number().int().positive('Venue capacity must be a positive integer.'),
  map_url: z.string().url('Invalid map URL.').max(255).optional().nullable().or(z.literal('')),
  contact: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  av_capabilities: z.array(AvCapabilitySchema).default([]),
  is_available: z.boolean().default(true),
  is_active: z.boolean().default(true),
});

export type CreateVenueInput = z.infer<typeof CreateVenueSchema>;
export type CreateVenueRawInput = z.input<typeof CreateVenueSchema>;

export const UpdateVenueSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  building: z.string().trim().min(2).max(100).optional(),
  room_number: z.string().trim().max(50).optional().nullable(),
  capacity: z.number().int().positive('Venue capacity must be a positive integer.').optional(),
  map_url: z.string().url('Invalid map URL.').max(255).optional().nullable().or(z.literal('')),
  contact: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  av_capabilities: z.array(AvCapabilitySchema).optional(),
  is_available: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export type UpdateVenueInput = z.infer<typeof UpdateVenueSchema>;

export const VenueQuerySchema = z.object({
  search: z.string().optional(),
  building: z.string().optional(),
  min_capacity: z.coerce.number().int().positive().optional(),
  av_capability: z.string().optional(),
  is_available: z.string().optional(),
  is_active: z.string().optional(),
});

export type VenueQuery = z.infer<typeof VenueQuerySchema>;

export const CheckConflictSchema = z
  .object({
    venue_id: z.string().uuid('Invalid venue ID.'),
    starts_at: z.string().datetime({ message: 'Start time must be a valid ISO 8601 datetime.' }),
    ends_at: z.string().datetime({ message: 'End time must be a valid ISO 8601 datetime.' }),
    exclude_event_id: z.string().uuid().optional(),
  })
  .refine((data) => new Date(data.ends_at) > new Date(data.starts_at), {
    message: 'Event end time must be after start time.',
    path: ['ends_at'],
  });

export type CheckConflictInput = z.infer<typeof CheckConflictSchema>;

export const ConflictCheckResponseSchema = z.object({
  available: z.boolean(),
  conflicting_event: z
    .object({
      id: z.string().uuid(),
      title: z.string(),
      starts_at: z.string(),
      ends_at: z.string(),
    })
    .optional(),
  message: z.string(),
});

export type ConflictCheckResponse = z.infer<typeof ConflictCheckResponseSchema>;

export interface VenueDetail {
  id: string;
  name: string;
  description: string | null;
  building: string;
  room_number: string | null;
  capacity: number;
  map_url: string | null;
  contact: string | null;
  notes: string | null;
  av_capabilities: string[];
  is_available: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicVenueSummary {
  id: string;
  name: string;
  description: string | null;
  building: string;
  room_number: string | null;
  capacity: number;
  map_url: string | null;
  av_capabilities: string[];
  is_available: boolean;
}
