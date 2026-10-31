import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('Content Checker Branch Mode Enforcement (RV-U3-01 / Finding F-03)', () => {
  const repoRoot = resolve(__dirname, '../../..');
  const scriptPath = resolve(repoRoot, 'scripts/validation/check-content.mjs');

  it('runs in WARN mode on feature branches under normal execution', () => {
    const output = execSync(`node "${scriptPath}"`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      env: { ...process.env, OVERRIDE_BRANCH: 'feature/sample-feature', NODE_ENV: 'test' },
    });

    expect(output).toContain('Mode: WARN (Development)');
    expect(output).toContain('[PASS]');
  });

  it('runs in STRICT mode when explicit --strict argument is passed', () => {
    const output = execSync(`node "${scriptPath}" --strict`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      env: { ...process.env, OVERRIDE_BRANCH: undefined, NODE_ENV: undefined },
    });

    expect(output).toContain('Mode: STRICT (Fail on violation)');
    expect(output).toContain('[PASS]');
  });

  it('ignores OVERRIDE_BRANCH during ordinary execution when NODE_ENV is not test', () => {
    const output = execSync(`node "${scriptPath}"`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      env: { ...process.env, OVERRIDE_BRANCH: 'feature/mock-branch', NODE_ENV: 'development' },
    });

    // OVERRIDE_BRANCH ignored; derives from git directly
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
    if (branch === 'main' || branch === 'master' || branch.startsWith('release/')) {
      expect(output).toContain('Mode: STRICT (Fail on violation)');
    } else {
      expect(output).toContain('Mode: WARN (Development)');
    }
  });

  it('honors OVERRIDE_BRANCH exclusively when NODE_ENV === test', () => {
    const output = execSync(`node "${scriptPath}"`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      env: { ...process.env, OVERRIDE_BRANCH: 'main', NODE_ENV: 'test' },
    });

    expect(output).toContain('Branch: main');
    expect(output).toContain('Mode: STRICT (Fail on violation)');
  });
});
