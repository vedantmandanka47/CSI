#!/usr/bin/env node
/**
 * CSI GCET SB — Production Dependency Security Audit Runner (TASK-010 / B12 / HR-005)
 *
 * Enforces strict `--audit-level=high` checks against production dependencies.
 * Fails CI/local builds on any unmitigated High or Critical CVE vulnerabilities.
 * Documents architectural defenses for bounded collections.
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:os';

const npmCmd = platform() === 'win32' ? 'npm.cmd' : 'npm';

console.log('================================================================');
console.log(' CSI GCET SB — Production Dependency Security Audit (audit-level=high)');
console.log('================================================================\n');

let auditOutput = '';
try {
  auditOutput = execSync(`${npmCmd} audit --omit=dev --json`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (err) {
  // npm audit exits with code 1 if vulnerabilities are found
  if (err && typeof err === 'object' && 'stdout' in err && err.stdout) {
    auditOutput = String(err.stdout);
  } else {
    console.error('[FATAL] Failed to execute npm audit:', err);
    process.exit(1);
  }
}

let report;
try {
  report = JSON.parse(auditOutput);
} catch (err) {
  console.error('[FATAL] Failed to parse npm audit JSON output:', err);
  process.exit(1);
}

const vulns = report.vulnerabilities || {};
const vulnKeys = Object.keys(vulns);

const unhandledHighs = [];
const unhandledCriticals = [];

// Mitigated advisories catalog with architectural defense justification
const KNOWN_MITIGATED_ADVISORIES = new Set([
  'GHSA-mrhx-c7xc-m3w5', // Zod unconstrained collection DoS (defended via 15MB gateway body limit in main.ts + schema bounds)
]);

for (const key of vulnKeys) {
  const item = vulns[key];
  const severity = item.severity;

  if (severity === 'critical') {
    unhandledCriticals.push({ key, item });
  } else if (severity === 'high') {
    const isMitigated = (item.via || []).some(
      (v) => typeof v === 'object' && KNOWN_MITIGATED_ADVISORIES.has(v.url?.split('/').pop() || ''),
    );

    if (isMitigated) {
      console.log(`[MITIGATED NOTICE] High-severity advisory on '${key}' is defensively mitigated:`);
      for (const v of item.via || []) {
        if (typeof v === 'object') {
          console.log(`  - Title: ${v.title}`);
          console.log(`  - Advisory: ${v.url}`);
          console.log(
            `  - Defense: Enforced express gateway body limit (15MB) and strict schema bounds on collections.`,
          );
        }
      }
      console.log('');
    } else {
      unhandledHighs.push({ key, item });
    }
  }
}

if (unhandledCriticals.length > 0) {
  console.error('================================================================');
  console.error(` [AUDIT FAILED] ${unhandledCriticals.length} CRITICAL vulnerability detected!`);
  for (const c of unhandledCriticals) {
    console.error(`  - Package: ${c.key}, details: ${JSON.stringify(c.item.via)}`);
  }
  console.error('================================================================\n');
  process.exit(1);
}

if (unhandledHighs.length > 0) {
  console.error('================================================================');
  console.error(` [AUDIT FAILED] ${unhandledHighs.length} unmitigated HIGH vulnerability detected!`);
  for (const h of unhandledHighs) {
    console.error(`  - Package: ${h.key}, details: ${JSON.stringify(h.item.via)}`);
  }
  console.error('================================================================\n');
  process.exit(1);
}

console.log('================================================================');
console.log(' [AUDIT PASS] Production dependency audit passed at audit-level=high.');
console.log(` Total prod dependencies scanned: ${report.metadata?.dependencies?.prod || 'N/A'}`);
console.log('================================================================\n');
process.exit(0);
