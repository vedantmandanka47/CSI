#!/usr/bin/env node
/**
 * CSI GCET SB — Secret Generation Utility (Section 4.3 & 4.4)
 * Generates cryptographically secure secrets to stdout.
 * MUST NOT write to any tracked file.
 */

import { randomBytes, generateKeyPairSync } from 'node:crypto';

function generateHex(bytes) {
  return randomBytes(bytes).toString('hex');
}

function generateEd25519Keys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  return {
    publicKey: Buffer.from(publicKey).toString('base64'),
    privateKey: Buffer.from(privateKey).toString('base64'),
    keyId: `qr-key-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(4).toString('hex')}`
  };
}

console.log('================================================================');
console.log(' CSI GCET SB — Cryptographic Secret Generator');
console.log(' Generated at:', new Date().toISOString());
console.log(' NEVER commit these values to version control.');
console.log(' Paste these into apps/api/.env (which is .gitignored).');
console.log('================================================================\n');

const sessionSecret = generateHex(32);
const csrfSecret = generateHex(32);
const appEncryptionKey = generateHex(32); // 32 bytes for AES-256-GCM
const qrKeys = generateEd25519Keys();

console.log('# --- Session and CSRF Secrets (>= 32 random bytes) ---');
console.log(`SESSION_SECRET="${sessionSecret}"`);
console.log(`CSRF_SECRET="${csrfSecret}"\n`);

console.log('# --- Application Encryption Key (32 bytes AES-256-GCM) ---');
console.log(`APP_ENCRYPTION_KEY="${appEncryptionKey}"\n`);

console.log('# --- Dynamic QR Signing Keys (Ed25519) ---');
console.log(`QR_KEY_ID="${qrKeys.keyId}"`);
console.log(`QR_SIGNING_PUBLIC_KEY="${qrKeys.publicKey}"`);
console.log(`QR_SIGNING_PRIVATE_KEY="${qrKeys.privateKey}"\n`);

console.log('================================================================');
console.log(' Done. Secrets printed to stdout only.');
