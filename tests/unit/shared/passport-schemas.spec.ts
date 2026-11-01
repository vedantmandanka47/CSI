import { describe, it, expect } from 'vitest';
import {
  PassportActivityItemSchema,
  PassportActivityType,
  PassportSummaryCountsSchema,
  StudentPassportResponseSchema,
  PublicPassportVerificationResponseSchema,
  RevokePassportInputSchema,
  VerificationOutcome,
} from '../../../packages/shared/src/index.js';

describe('M14 Passport Shared Schemas', () => {
  it('validates a valid PassportActivityItem', () => {
    const activity = {
      id: 'act-1',
      type: PassportActivityType.EVENT_ATTENDANCE,
      title: 'Docker & Kubernetes Workshop',
      category: 'workshop',
      date: '2026-10-15',
      verificationStatus: 'verified',
      verifiedAt: '2026-10-15T10:30:00Z',
    };

    const parsed = PassportActivityItemSchema.safeParse(activity);
    expect(parsed.success).toBe(true);
  });

  it('validates a valid PassportSummaryCounts', () => {
    const summary = {
      eventsAttended: 5,
      certificatesEarned: 2,
      committeeTenures: 1,
      totalActivities: 8,
    };
    const parsed = PassportSummaryCountsSchema.safeParse(summary);
    expect(parsed.success).toBe(true);
  });

  it('rejects an invalid activity type', () => {
    const activity = {
      id: 'act-1',
      type: 'invalid_type',
      title: 'Invalid',
      category: 'workshop',
      date: '2026-10-15',
      verificationStatus: 'verified',
    };

    const parsed = PassportActivityItemSchema.safeParse(activity);
    expect(parsed.success).toBe(false);
  });

  it('validates a complete StudentPassportResponse', () => {
    const passportData = {
      student: {
        id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        name: 'Ananya Sharma',
        email: 'ananya@gcet.ac.in',
        enrollmentNo: '21012011001',
        branch: 'Computer Science & Engineering',
        year: 3,
        status: 'active',
      },
      summary: {
        eventsAttended: 3,
        certificatesEarned: 2,
        committeeTenures: 1,
        totalActivities: 6,
      },
      activities: [
        {
          id: 'act-1',
          type: PassportActivityType.COMMITTEE_ROLE,
          title: 'Core Committee Member',
          category: 'leadership',
          date: '2026-08-01',
          verificationStatus: 'verified',
          roleName: 'Core Member',
          committeeName: 'Technical Committee',
          tenureStart: '2026-08-01T00:00:00Z',
          tenureEnd: null,
        },
        {
          id: 'act-2',
          type: PassportActivityType.CERTIFICATE,
          title: 'Certificate of Merit - Hackathon 2026',
          category: 'competition',
          date: '2026-09-20',
          verificationStatus: 'verified',
          certificateNumber: 'CSI-2026-HACK-MERIT-001',
          certificateType: 'merit',
          certificateFileAvailable: true,
        },
      ],
      latestPassport: {
        id: 'p-1',
        passportNumber: 'CSI-PASS-2026-0001',
        status: 'active',
        generatedAt: '2026-10-25T12:00:00Z',
        hasFile: true,
      },
    };

    const parsed = StudentPassportResponseSchema.safeParse(passportData);
    expect(parsed.success).toBe(true);
  });

  it('validates a PublicPassportVerificationResponse', () => {
    const publicResponse = {
      status: VerificationOutcome.VALID,
      isAuthentic: true,
      credentialType: 'passport',
      passportNumber: 'CSI-PASS-2026-0001',
      studentName: 'Ananya Sharma',
      generatedAt: '2026-10-25T12:00:00Z',
      issuingInstitution: 'Computer Society of India - GCET Student Branch',
      summaryCounts: {
        eventsAttended: 3,
        certificatesEarned: 2,
        committeeTenures: 1,
        totalActivities: 6,
      },
      message: 'Official CSI GCET Student Activity Passport is authentic and verified.',
    };

    const parsed = PublicPassportVerificationResponseSchema.safeParse(publicResponse);
    expect(parsed.success).toBe(true);
  });

  it('validates RevokePassportInput schema', () => {
    expect(RevokePassportInputSchema.safeParse({ reason: 'Student graduated and requested invalidation.' }).success).toBe(true);
    expect(RevokePassportInputSchema.safeParse({ reason: 'tiny' }).success).toBe(false);
  });
});

