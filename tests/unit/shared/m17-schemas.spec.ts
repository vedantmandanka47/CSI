import { describe, it, expect } from 'vitest';
import {
  CreateAcademicTermSchema,
  UpdateAcademicTermSchema,
  TermStatus,
  IncomingAppointmentInputSchema,
  RolloverPreviewRequestSchema,
  ExecuteRolloverRequestSchema,
  RoleCode,
} from '../../../packages/shared/src/index.js';

describe('Module M17 Shared Schemas', () => {
  describe('CreateAcademicTermSchema', () => {
    it('accepts valid academic term payload', () => {
      const valid = {
        name: 'Academic Year 2026-2027',
        code: '2026-2027',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2027-06-30T23:59:59.000Z',
      };
      const parsed = CreateAcademicTermSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('rejects payload when startDate is after endDate', () => {
      const invalid = {
        name: 'Inverted Term Dates',
        code: '2026-2027',
        startDate: '2027-08-01T00:00:00.000Z',
        endDate: '2026-06-30T23:59:59.000Z',
      };
      const parsed = CreateAcademicTermSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toContain('strictly before');
      }
    });

    it('rejects short term name or invalid code characters', () => {
      const invalid = {
        name: 'AY',
        code: '2026 2027!',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2027-06-30T23:59:59.000Z',
      };
      const parsed = CreateAcademicTermSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });

  describe('UpdateAcademicTermSchema', () => {
    it('accepts valid partial update', () => {
      const valid = {
        name: 'Updated Term Name',
        status: TermStatus.ACTIVE,
      };
      const parsed = UpdateAcademicTermSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('validates dates if both are provided', () => {
      const invalid = {
        startDate: '2027-01-01T00:00:00.000Z',
        endDate: '2026-01-01T00:00:00.000Z',
      };
      const parsed = UpdateAcademicTermSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });

  describe('IncomingAppointmentInputSchema', () => {
    it('validates a valid incoming appointment', () => {
      const valid = {
        userId: '11111111-1111-1111-1111-111111111111',
        roleCode: RoleCode.PRESIDENT,
        committeeCode: null,
      };
      const parsed = IncomingAppointmentInputSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid uuid for user', () => {
      const invalid = {
        userId: 'not-a-uuid',
        roleCode: RoleCode.COMMITTEE,
        committeeCode: 'technical',
      };
      const parsed = IncomingAppointmentInputSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });

  describe('Rollover Execution Schemas', () => {
    it('accepts valid preview request with defaults', () => {
      const valid = {
        toTermId: '22222222-2222-2222-2222-222222222222',
      };
      const parsed = RolloverPreviewRequestSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.archiveOpenTasks).toBe(true);
        expect(parsed.data.transitionGraduatingMembers).toBe(true);
      }
    });

    it('validates execute rollover request with confirmation code', () => {
      const valid = {
        toTermId: '22222222-2222-2222-2222-222222222222',
        incomingAppointments: [
          {
            userId: '33333333-3333-3333-3333-333333333333',
            roleCode: RoleCode.PRESIDENT,
          },
        ],
        confirmationCode: 'CONFIRM_ROLLOVER_2026-2027',
      };
      const parsed = ExecuteRolloverRequestSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('rejects execute request missing confirmation code', () => {
      const invalid = {
        toTermId: '22222222-2222-2222-2222-222222222222',
        confirmationCode: '',
      };
      const parsed = ExecuteRolloverRequestSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });
});
