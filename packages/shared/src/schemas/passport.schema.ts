import { z } from 'zod';
import { VerificationOutcome } from './certificate-verification.schema.js';

export const PassportActivityType = {
  EVENT_ATTENDANCE: 'event_attendance',
  CERTIFICATE: 'certificate',
  COMMITTEE_ROLE: 'committee_role',
} as const;

export type PassportActivityType =
  (typeof PassportActivityType)[keyof typeof PassportActivityType];

export const PassportActivityCategory = {
  WORKSHOP: 'workshop',
  HACKATHON: 'hackathon',
  SEMINAR: 'seminar',
  COMPETITION: 'competition',
  LEADERSHIP: 'leadership',
  COMMUNITY: 'community',
  OTHER: 'other',
} as const;

export type PassportActivityCategory =
  (typeof PassportActivityCategory)[keyof typeof PassportActivityCategory];

export const PassportActivityItemSchema = z.object({
  id: z.string(),
  type: z.enum([
    PassportActivityType.EVENT_ATTENDANCE,
    PassportActivityType.CERTIFICATE,
    PassportActivityType.COMMITTEE_ROLE,
  ]),
  title: z.string(),
  category: z.string(),
  date: z.string(),
  details: z.string().optional(),
  verificationStatus: z.enum(['verified', 'unverified']),
  verifiedAt: z.string().optional(),
  certificateNumber: z.string().optional(),
  certificateType: z.string().optional(),
  certificateFileAvailable: z.boolean().optional(),
  tenureStart: z.string().optional(),
  tenureEnd: z.string().nullable().optional(),
  roleName: z.string().optional(),
  committeeName: z.string().optional(),
});

export type PassportActivityItem = z.infer<typeof PassportActivityItemSchema>;

export const PassportSummaryCountsSchema = z.object({
  eventsAttended: z.number().int().min(0),
  certificatesEarned: z.number().int().min(0),
  committeeTenures: z.number().int().min(0),
  totalActivities: z.number().int().min(0),
});

export type PassportSummaryCounts = z.infer<typeof PassportSummaryCountsSchema>;

export const StudentPassportResponseSchema = z.object({
  student: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    enrollmentNo: z.string().nullable(),
    branch: z.string().nullable(),
    year: z.number().nullable(),
    status: z.string(),
  }),
  summary: PassportSummaryCountsSchema,
  activities: z.array(PassportActivityItemSchema),
  latestPassport: z
    .object({
      id: z.string(),
      passportNumber: z.string(),
      status: z.string(),
      generatedAt: z.string(),
      hasFile: z.boolean(),
    })
    .nullable(),
});

export type StudentPassportResponse = z.infer<typeof StudentPassportResponseSchema>;

export const PublicPassportVerificationResponseSchema = z.object({
  status: z.enum([
    VerificationOutcome.VALID,
    VerificationOutcome.REVOKED,
    VerificationOutcome.INTEGRITY_MISMATCH,
    VerificationOutcome.NOT_FOUND,
    VerificationOutcome.INVALID,
  ]),
  isAuthentic: z.boolean(),
  credentialType: z.literal('passport').default('passport'),
  passportNumber: z.string().optional(),
  studentName: z.string().optional(),
  generatedAt: z.string().optional(),
  issuingInstitution: z.string().optional(),
  summaryCounts: PassportSummaryCountsSchema.optional(),
  revokedAt: z.string().optional(),
  revocationReason: z.string().optional(),
  message: z.string().optional(),
});

export type PublicPassportVerificationResponse = z.infer<
  typeof PublicPassportVerificationResponseSchema
>;

export const RevokePassportInputSchema = z.object({
  reason: z.string().min(5, 'Revocation reason must be at least 5 characters long').max(500),
});

export type RevokePassportInput = z.infer<typeof RevokePassportInputSchema>;

