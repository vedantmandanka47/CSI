import { Test, TestingModule } from '@nestjs/testing';
import { PassportPdfService } from '../../../../../apps/api/src/modules/passports/services/passport-pdf.service.js';
import { StudentPassportResponse, PassportActivityType } from '@csi/shared';
import { PDFDocument } from 'pdf-lib';
import { createHash } from 'crypto';

describe('PassportPdfService', () => {
  let service: PassportPdfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PassportPdfService],
    }).compile();

    service = module.get<PassportPdfService>(PassportPdfService);
  });

  const basePassportData: StudentPassportResponse = {
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
        title: 'Core Committee Member — Technical Committee',
        category: 'leadership',
        date: '2026-08-01',
        details: 'Committee: Technical Committee',
        verificationStatus: 'verified',
        tenureStart: '2026-08-01T00:00:00Z',
        tenureEnd: null,
      },
      {
        id: 'act-2',
        type: PassportActivityType.CERTIFICATE,
        title: 'First Prize Winner — CSI Annual Hackathon 2026',
        category: 'competition',
        date: '2026-09-20',
        details: 'Certificate Number: CSI-2026-HACK-MERIT-001',
        verificationStatus: 'verified',
        certificateNumber: 'CSI-2026-HACK-MERIT-001',
        certificateType: 'merit',
      },
      {
        id: 'act-3',
        type: PassportActivityType.EVENT_ATTENDANCE,
        title: 'Docker & Kubernetes Cloud DevOps Workshop',
        category: 'workshop',
        date: '2026-10-15',
        details: 'Verified check-in via QR scan',
        verificationStatus: 'verified',
      },
    ],
    latestPassport: null,
  };

  it('generates a valid, parseable PDF buffer with correct magic header', async () => {
    const result = await service.generatePassportPdf(
      basePassportData,
      'CSI-PASS-2026-A1B2',
      '47XQ-9M2K-W8TR-5VNP',
      'https://csi-gcet.edu.in/verify/passport/47XQ9M2KW8TR5VNP',
    );

    expect(result.pdfBuffer).toBeDefined();
    expect(result.pdfBuffer.length).toBeGreaterThan(1000);

    // Verify PDF header magic bytes
    const header = result.pdfBuffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');

    // Verify SHA-256 digest match
    const computedHash = createHash('sha256').update(result.pdfBuffer).digest('hex');
    expect(result.fileHash).toBe(computedHash);

    // Verify PDF structure with pdf-lib
    const parsedDoc = await PDFDocument.load(result.pdfBuffer);
    expect(parsedDoc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(parsedDoc.getTitle()).toContain('Ananya Sharma');
    expect(parsedDoc.getAuthor()).toBe('Computer Society of India - GCET Student Branch');
  });

  it('handles multi-page pagination for large activity lists', async () => {
    // Generate 35 activities to trigger page breaks
    const largeActivities = Array.from({ length: 35 }).map((_, i) => ({
      id: `act-large-${i}`,
      type: PassportActivityType.EVENT_ATTENDANCE,
      title: `Advanced Technical Workshop Series Part ${i + 1} on Distributed Cloud Computing & Microservices`,
      category: 'workshop',
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      details: 'Verified attendance check-in',
      verificationStatus: 'verified' as const,
    }));

    const multiPageData: StudentPassportResponse = {
      ...basePassportData,
      activities: largeActivities,
      summary: {
        ...basePassportData.summary,
        totalActivities: 35,
        eventsAttended: 35,
      },
    };

    const result = await service.generatePassportPdf(
      multiPageData,
      'CSI-PASS-2026-MULTI',
      '47XQ-9M2K-W8TR-5VNP',
      'https://csi-gcet.edu.in/verify/passport/47XQ9M2KW8TR5VNP',
    );

    const parsedDoc = await PDFDocument.load(result.pdfBuffer);
    // Should span across multiple pages (at least 2)
    expect(parsedDoc.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it('handles empty dossier gracefully', async () => {
    const emptyData: StudentPassportResponse = {
      ...basePassportData,
      activities: [],
      summary: {
        eventsAttended: 0,
        certificatesEarned: 0,
        committeeTenures: 0,
        totalActivities: 0,
      },
    };

    const result = await service.generatePassportPdf(
      emptyData,
      'CSI-PASS-2026-EMPTY',
      '47XQ-9M2K-W8TR-5VNP',
      'https://csi-gcet.edu.in/verify/passport/47XQ9M2KW8TR5VNP',
    );

    expect(result.pdfBuffer).toBeDefined();
    const parsedDoc = await PDFDocument.load(result.pdfBuffer);
    expect(parsedDoc.getPageCount()).toBe(1);
  });

  it('handles long student names and title text wrapping without throwing', async () => {
    const longData: StudentPassportResponse = {
      ...basePassportData,
      student: {
        ...basePassportData.student,
        name: 'Venkata Ramanujam Srimannarayana Murthy Krishna Swaminathan',
        branch: 'Electronics and Instrumentation Engineering with Specialization in Industrial Automation',
      },
      activities: [
        {
          id: 'act-long',
          type: PassportActivityType.EVENT_ATTENDANCE,
          title: 'Comprehensive National Level Multi-Disciplinary Flagship Hackathon and Engineering Design Competition 2026 with Industry Mentors and Cloud Infrastructure',
          category: 'competition',
          date: '2026-10-20',
          details: 'Verified participation in grand finale round',
          verificationStatus: 'verified',
        },
      ],
    };

    const result = await service.generatePassportPdf(
      longData,
      'CSI-PASS-2026-LONG',
      '47XQ-9M2K-W8TR-5VNP',
      'https://csi-gcet.edu.in/verify/passport/47XQ9M2KW8TR5VNP',
    );

    expect(result.pdfBuffer).toBeDefined();
    const parsedDoc = await PDFDocument.load(result.pdfBuffer);
    expect(parsedDoc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
