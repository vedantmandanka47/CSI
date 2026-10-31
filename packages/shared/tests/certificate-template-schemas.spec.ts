import { describe, it, expect } from 'vitest';
import {
  CertificateTemplateConfigSchema,
  CertificateDataSchema,
  RenderCertificateInputSchema,
  ValidateTemplateInputSchema,
  PageOrientation,
  CertificateType,
  StandardFontFamily,
} from '../src/index.js';

describe('M11 Certificate Template Schemas', () => {
  const validTemplate = {
    id: 'csi-participation-v1',
    name: 'CSI Official Certificate of Participation',
    description: 'Standard event participation certificate template',
    type: CertificateType.PARTICIPATION,
    dimensions: { width: 841.89, height: 595.28 },
    orientation: PageOrientation.LANDSCAPE,
    backgroundColor: '#FFFFFF',
    border: {
      enabled: true,
      primaryColor: '#2B3A8C',
      accentColor: '#C8402F',
      width: 4,
      inset: 20,
      doubleBorder: true,
      cornerOrnament: true,
    },
    textElements: [
      {
        id: 'title',
        text: 'CERTIFICATE OF PARTICIPATION',
        x: 420.95,
        y: 450,
        fontFamily: StandardFontFamily.HELVETICA_BOLD,
        fontSize: 28,
        color: '#2B3A8C',
        alignment: 'center' as const,
      },
      {
        id: 'recipient',
        text: '{{recipient_name}}',
        x: 420.95,
        y: 320,
        fontFamily: StandardFontFamily.TIMES_BOLD,
        fontSize: 32,
        color: '#111827',
        alignment: 'center' as const,
        maxWidth: 600,
        autoDownscale: true,
        minFontSize: 16,
      },
    ],
    imageElements: [
      {
        id: 'csi_emblem',
        assetKey: 'csi_logo',
        x: 420.95,
        y: 500,
        width: 80,
        height: 80,
        alignment: 'center' as const,
      },
    ],
    signatories: [
      {
        id: 'counselor',
        name: 'Dr. Faculty Counselor',
        title: 'Branch Counselor, CSI GCET',
        x: 180,
        y: 80,
        width: 180,
      },
      {
        id: 'chair',
        name: 'Student Chairperson',
        title: 'Chairperson, CSI GCET SB',
        x: 660,
        y: 80,
        width: 180,
      },
    ],
  };

  it('validates a complete, valid certificate template configuration', () => {
    const parsed = CertificateTemplateConfigSchema.parse(validTemplate);
    expect(parsed.id).toBe('csi-participation-v1');
    expect(parsed.dimensions.width).toBe(841.89);
    expect(parsed.orientation).toBe('landscape');
    expect(parsed.textElements).toHaveLength(2);
    expect(parsed.textElements[1]?.autoDownscale).toBe(true);
    expect(parsed.signatories).toHaveLength(2);
  });

  it('rejects a template with empty textElements array', () => {
    const invalidTemplate = {
      ...validTemplate,
      textElements: [],
    };

    expect(() => CertificateTemplateConfigSchema.parse(invalidTemplate)).toThrow(
      /at least one text element/i,
    );
  });

  it('rejects invalid hex colors in border or text configuration', () => {
    const invalidBorder = {
      ...validTemplate,
      border: {
        ...validTemplate.border,
        primaryColor: 'not-a-color',
      },
    };

    expect(() => CertificateTemplateConfigSchema.parse(invalidBorder)).toThrow(
      /invalid hex color format/i,
    );
  });

  it('rejects negative or excessively small page dimensions', () => {
    const invalidDimensions = {
      ...validTemplate,
      dimensions: { width: 50, height: 50 },
    };

    expect(() => CertificateTemplateConfigSchema.parse(invalidDimensions)).toThrow(
      /at least 200 points/i,
    );
  });

  it('validates certificate participant data and optional custom placeholders', () => {
    const validData = {
      recipient_name: 'Vedant Mandanka',
      recipient_id: '12102080601001',
      event_title: 'Full Stack Web Architecture Workshop 2026',
      event_category: 'Technical Workshop',
      issue_date: 'October 31, 2026',
      achievement: 'Certificate of Excellence',
      certificate_number: 'CSI-GCET-2026-0042',
      custom_placeholders: {
        rank: '1st Place',
        track: 'Cloud & Systems',
      },
    };

    const parsed = CertificateDataSchema.parse(validData);
    expect(parsed.recipient_name).toBe('Vedant Mandanka');
    expect(parsed.custom_placeholders?.rank).toBe('1st Place');
  });

  it('rejects certificate data missing mandatory recipient_name or event_title', () => {
    expect(() =>
      CertificateDataSchema.parse({
        event_title: 'Demo Event',
        issue_date: '2026-10-31',
      }),
    ).toThrow(/recipient name is required/i);

    expect(() =>
      CertificateDataSchema.parse({
        recipient_name: 'Student Name',
        issue_date: '2026-10-31',
      }),
    ).toThrow(/event title is required/i);
  });

  it('validates RenderCertificateInput combining template and data', () => {
    const renderPayload = {
      template: validTemplate,
      data: {
        recipient_name: 'Test Participant',
        event_title: 'Tech Fest 2026',
        issue_date: '2026-10-31',
      },
    };

    const parsed = RenderCertificateInputSchema.parse(renderPayload);
    expect(parsed.template.id).toBe('csi-participation-v1');
    expect(parsed.data.recipient_name).toBe('Test Participant');
  });

  it('validates ValidateTemplateInput schema', () => {
    const validatePayload = {
      template: validTemplate,
    };

    const parsed = ValidateTemplateInputSchema.parse(validatePayload);
    expect(parsed.template.name).toBe('CSI Official Certificate of Participation');
  });
});

