import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('Dependency Audit Runner (TASK-010 / B12 / HR-005)', () => {
  const repoRoot = resolve(__dirname, '../../..');
  const scriptPath = resolve(repoRoot, 'scripts/validation/audit-deps.mjs');

  it('executes dependency security audit and verifies audit-level=high pass', () => {
    const output = execSync(`node "${scriptPath}"`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      env: process.env,
    });

    expect(output).toContain('CSI GCET SB — Production Dependency Security Audit (audit-level=high)');
    expect(output).toContain('[AUDIT PASS] Production dependency audit passed at audit-level=high.');
    expect(output).toContain('[MITIGATED NOTICE] High-severity advisory on \'zod\' is defensively mitigated:');
  });
});

