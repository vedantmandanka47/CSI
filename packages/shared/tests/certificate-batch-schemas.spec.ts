import { describe, it, expect } from 'vitest';
import {
  CreateCertificateBatchInputSchema,
  CertificateBatchResponseSchema,
  CertificateDetailSchema,
  BatchStatus,
  CertificateStatus,
  RecipientEligibilityMode,
  CertificateType,
} from '../src/index.js';

describe('M12 Certificate Batch Schemas', () => {
  const validEventId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const validUserId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

  it('validates a valid CreateCertificateBatchInput with defaults', () => {
    const input = {
      eventId: validEventId,
    };
    const result = CreateCertificateBatchInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.templateId).toBe('csi-default-participation');
      expect(result.data.certificateType).toBe(CertificateType.PARTICIPATION);
      expect(result.data.eligibilityMode).toBe(RecipientEligibilityMode.VERIFIED_ATTENDANCE);
    }
  });

  it('validates explicit recipients with achievements and custom placeholders', () => {
    const input = {
      eventId: validEventId,
      certificateType: CertificateType.MERIT,
      eligibilityMode: RecipientEligibilityMode.EXPLICIT_SELECTION,
      recipients: [
        {
          userId: validUserId,
          email: 'winner1@gcet.ac.in',
          name: 'First Place Winner',
          achievement: '1st Prize',
          customPlaceholders: {
            cashPrize: '5000 INR',
          },
        },
      ],
    };
    const result = CreateCertificateBatchInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recipients?.length).toBe(1);
      expect(result.data.recipients?.[0].achievement).toBe('1st Prize');
    }
  });

  it('rejects invalid event UUID', () => {
    const input = {
      eventId: 'not-a-valid-uuid',
    };
    const result = CreateCertificateBatchInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects invalid recipient email in batch', () => {
    const input = {
      eventId: validEventId,
      eligibilityMode: RecipientEligibilityMode.EXPLICIT_SELECTION,
      recipients: [
        {
          email: 'not-an-email',
        },
      ],
    };
    const result = CreateCertificateBatchInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('validates CertificateBatchResponse structure', () => {
    const batchData = {
      id: validEventId,
      eventId: validEventId,
      templateId: 'csi-default-participation',
      certificateType: 'participation',
      status: BatchStatus.PROCESSING,
      totalCount: 50,
      successCount: 25,
      failedCount: 0,
      progressPercent: 50,
      createdById: validUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const result = CertificateBatchResponseSchema.safeParse(batchData);
    expect(result.success).toBe(true);
  });

  it('validates CertificateDetail structure', () => {
    const certData = {
      id: validEventId,
      batchId: validEventId,
      eventId: validEventId,
      recipientType: 'member',
      recipientId: validUserId,
      recipientEmail: 'student@gcet.ac.in',
      recipientName: 'Student Name',
      certificateType: 'participation',
      certificateNumber: 'CSI-2026-TEST-001',
      issueDate: 'October 31, 2026',
      status: CertificateStatus.GENERATED,
      fileSizeBytes: 24500,
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };
    const result = CertificateDetailSchema.safeParse(certData);
    expect(result.success).toBe(true);
  });
});
