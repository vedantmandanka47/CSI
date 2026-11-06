import { validateGuestRetentionDays } from '../../../../scripts/maintenance/run-retention-purge';

describe('Retention Purge Configuration Validation (Finding 2.5 / AUD-OPS-01)', () => {
  describe('Valid Retention Values', () => {
    it('should default to 90 days when undefined or null', () => {
      expect(validateGuestRetentionDays(undefined)).toBe(90);
      expect(validateGuestRetentionDays(null as unknown as undefined)).toBe(90);
    });

    it('should accept valid positive integers within range', () => {
      expect(validateGuestRetentionDays('1')).toBe(1);
      expect(validateGuestRetentionDays('30')).toBe(30);
      expect(validateGuestRetentionDays('90')).toBe(90);
      expect(validateGuestRetentionDays('365')).toBe(365);
      expect(validateGuestRetentionDays('3650')).toBe(3650);
    });

    it('should handle trimmed valid input', () => {
      expect(validateGuestRetentionDays('  90  ')).toBe(90);
    });
  });

  describe('Invalid Retention Values Rejection', () => {
    it('should reject empty or whitespace strings', () => {
      expect(() => validateGuestRetentionDays('')).toThrow(/cannot be empty/);
      expect(() => validateGuestRetentionDays('   ')).toThrow(/cannot be empty/);
    });

    it('should reject strings with arbitrary text suffixes like 90days', () => {
      expect(() => validateGuestRetentionDays('90days')).toThrow(/strictly positive whole integer/);
      expect(() => validateGuestRetentionDays('90 days')).toThrow(/strictly positive whole integer/);
      expect(() => validateGuestRetentionDays('days90')).toThrow(/strictly positive whole integer/);
    });

    it('should reject decimal and float values', () => {
      expect(() => validateGuestRetentionDays('1.5')).toThrow(/strictly positive whole integer/);
      expect(() => validateGuestRetentionDays('90.0')).toThrow(/strictly positive whole integer/);
      expect(() => validateGuestRetentionDays('0.9')).toThrow(/strictly positive whole integer/);
    });

    it('should reject zero and negative integers', () => {
      expect(() => validateGuestRetentionDays('0')).toThrow(/strictly positive whole integer/);
      expect(() => validateGuestRetentionDays('-1')).toThrow(/strictly positive whole integer/);
      expect(() => validateGuestRetentionDays('-90')).toThrow(/strictly positive whole integer/);
    });

    it('should reject numbers with leading zeros', () => {
      expect(() => validateGuestRetentionDays('090')).toThrow(/strictly positive whole integer/);
      expect(() => validateGuestRetentionDays('007')).toThrow(/strictly positive whole integer/);
    });

    it('should reject values greater than 3650', () => {
      expect(() => validateGuestRetentionDays('3651')).toThrow(/between 1 and 3650 days/);
      expect(() => validateGuestRetentionDays('99999')).toThrow(/between 1 and 3650 days/);
    });

    it('should reject non-numeric inputs', () => {
      expect(() => validateGuestRetentionDays('abc')).toThrow(/strictly positive whole integer/);
      expect(() => validateGuestRetentionDays('NaN')).toThrow(/strictly positive whole integer/);
      expect(() => validateGuestRetentionDays('Infinity')).toThrow(/strictly positive whole integer/);
      expect(() => validateGuestRetentionDays('null')).toThrow(/strictly positive whole integer/);
    });
  });
});

