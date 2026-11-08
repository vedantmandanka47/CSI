import { describe, it, expect } from 'vitest';
import nextConfig from '../../../apps/web/next.config.js';

describe('Web Application Security Headers & Permissions-Policy (TASK-020 / B09 / F14 / HR-003)', () => {
  it('defines headers as an asynchronous configuration function', () => {
    expect(typeof nextConfig.headers).toBe('function');
  });

  it('restricts camera access globally with Permissions-Policy camera=()', async () => {
    const headersList = await nextConfig.headers!();
    const globalHeaderRule = headersList.find((h) => h.source === '/:path*');

    expect(globalHeaderRule).toBeDefined();
    const permissionsPolicy = globalHeaderRule?.headers.find(
      (h) => h.key === 'Permissions-Policy',
    );
    expect(permissionsPolicy).toBeDefined();
    expect(permissionsPolicy?.value).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('scopes Permissions-Policy to permit camera=(self) specifically for /scanner routes', async () => {
    const headersList = await nextConfig.headers!();

    const scannerExactRule = headersList.find((h) => h.source === '/scanner');
    expect(scannerExactRule).toBeDefined();
    const scannerExactPolicy = scannerExactRule?.headers.find(
      (h) => h.key === 'Permissions-Policy',
    );
    expect(scannerExactPolicy?.value).toBe('camera=(self), microphone=(), geolocation=()');

    const scannerSubpathRule = headersList.find((h) => h.source === '/scanner/:path*');
    expect(scannerSubpathRule).toBeDefined();
    const scannerSubpathPolicy = scannerSubpathRule?.headers.find(
      (h) => h.key === 'Permissions-Policy',
    );
    expect(scannerSubpathPolicy?.value).toBe('camera=(self), microphone=(), geolocation=()');
  });

  it('preserves strict security baseline headers across routes', async () => {
    const headersList = await nextConfig.headers!();
    const globalRule = headersList.find((h) => h.source === '/:path*');
    const headerKeys = globalRule?.headers.map((h) => h.key) ?? [];

    expect(headerKeys).toContain('X-Content-Type-Options');
    expect(headerKeys).toContain('X-Frame-Options');
    expect(headerKeys).toContain('Referrer-Policy');
    expect(headerKeys).toContain('Cross-Origin-Opener-Policy');
    expect(headerKeys).toContain('Permissions-Policy');
  });
});

