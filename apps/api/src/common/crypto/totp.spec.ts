import { generateBase32Secret, generateTotp, verifyTotp } from './totp.js';

describe('TOTP Utility (RFC 6238) (M9)', () => {
  const secret = 'JBSWY3DPEHPK3PXP'; // Standard test base32 string

  it('generates random Base32 secrets of requested byte length', () => {
    const s1 = generateBase32Secret(20);
    const s2 = generateBase32Secret(20);
    expect(s1).toBeDefined();
    expect(s1.length).toBeGreaterThanOrEqual(32);
    expect(s1).not.toBe(s2);
    expect(/^[A-Z2-7]+$/.test(s1)).toBe(true);
  });

  it('generates a 6-digit zero-padded TOTP string', () => {
    const code = generateTotp(secret, 30, 1600000000000);
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  it('verifies TOTP code at the current time step', () => {
    const now = Date.now();
    const code = generateTotp(secret, 30, now);
    const isValid = verifyTotp(code, secret, 30, 1, now);
    expect(isValid).toBe(true);
  });

  it('verifies TOTP within +/- 1 step window', () => {
    const now = Date.now();
    // Generated 25 seconds ago (within 1 step window of 30s)
    const pastCode = generateTotp(secret, 30, now - 25000);
    expect(verifyTotp(pastCode, secret, 30, 1, now)).toBe(true);

    // Generated 25 seconds in future (within 1 step window of 30s)
    const futureCode = generateTotp(secret, 30, now + 25000);
    expect(verifyTotp(futureCode, secret, 30, 1, now)).toBe(true);
  });

  it('rejects TOTP code outside the accepted window', () => {
    const now = Date.now();
    // 90 seconds ago (3 steps behind)
    const oldCode = generateTotp(secret, 30, now - 90000);
    expect(verifyTotp(oldCode, secret, 30, 1, now)).toBe(false);
  });

  it('rejects malformed or forged TOTP codes', () => {
    expect(verifyTotp('12345', secret)).toBe(false);
    expect(verifyTotp('abcdef', secret)).toBe(false);
    expect(verifyTotp('000000', secret)).toBe(false);
  });
});

