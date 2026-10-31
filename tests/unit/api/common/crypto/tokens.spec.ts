import { hashPassword, verifyPassword, generateSecureToken, hashToken } from '../../../../../apps/api/src/common/crypto/tokens.js';

describe('Crypto & Token Utilities (DEP-03, PRIV-13)', () => {
  it('hashes passwords using Argon2id and verifies successfully', async () => {
    const raw = 'SuperSecureP@ssw0rd123!';
    const hash = await hashPassword(raw);

    expect(hash).toContain('$argon2id$');
    const valid = await verifyPassword(hash, raw);
    expect(valid).toBe(true);

    const invalid = await verifyPassword(hash, 'WrongP@ssw0rd123!');
    expect(invalid).toBe(false);
  });

  it('generates 64-char random tokens with high entropy', () => {
    const t1 = generateSecureToken();
    const t2 = generateSecureToken();

    expect(t1).toHaveLength(64);
    expect(t2).toHaveLength(64);
    expect(t1).not.toBe(t2);
  });

  it('hashes tokens deterministically with SHA-256', () => {
    const token = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const h1 = hashToken(token);
    const h2 = hashToken(token);

    expect(h1).toHaveLength(64);
    expect(h1).toBe(h2);
  });
});

