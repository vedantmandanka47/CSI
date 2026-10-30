#!/usr/bin/env node
/**
 * CSI GCET SB — Content & Compliance Scan Utility (Section 4.4, 8.7, PRIV-13)
 * Scans apps/web/src for:
 * 1. [CONTENT NEEDED] markers
 * 2. Lorem ipsum placeholder copy
 * 3. href="#" placeholder links
 * 4. Banned compliance & security claim phrases (PRIV-13)
 *
 * Mode:
 * - On feature branches: warns (exit 0)
 * - On release branches (main/release/*) or with --strict flag: fails (exit 1)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = resolve('.');
const SCAN_DIR = join(ROOT_DIR, 'apps', 'web', 'src');

const CHECKS = [
  {
    id: 'CONTENT_NEEDED',
    description: '[CONTENT NEEDED] markers',
    pattern: /\[CONTENT NEEDED\]/gi
  },
  {
    id: 'LOREM_IPSUM',
    description: 'Lorem ipsum placeholder copy',
    pattern: /\b(?:lorem\s+ipsum|dolor\s+sit\s+amet|consectetur\s+adipiscing)\b/gi
  },
  {
    id: 'DEAD_HREF',
    description: 'Dead anchor link href="#"',
    pattern: /href\s*=\s*["']#["']/gi
  },
  {
    id: 'BANNED_COMPLIANCE_PHRASE',
    description: 'Unsupported compliance/security claims (PRIV-13)',
    pattern: /\b(?:DPDP\s+compliant|fully\s+secure|100%\s+private|unhackable|completely\s+secure|guaranteed\s+privacy)\b/gi
  }
];

function getAllFiles(dir) {
  let results = [];
  try {
    const list = readdirSync(dir);
    for (const file of list) {
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (!['node_modules', '.next', 'dist', 'coverage'].includes(file)) {
          results = results.concat(getAllFiles(fullPath));
        }
      } else if (/\.(tsx|ts|jsx|js|html|md|css)$/.test(file)) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
  }
  return results;
}

function getCurrentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['pipe', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const args = process.argv.slice(2);
const isStrictArg = args.includes('--strict');

// In ordinary development, CI, and release runs, branch is always derived strictly from Git.
// OVERRIDE_BRANCH is scoped exclusively to automated test harnesses (NODE_ENV === 'test') (RV-U3-01).
const isTestEnv = process.env.NODE_ENV === 'test';
const currentBranch = isTestEnv && process.env.OVERRIDE_BRANCH ? process.env.OVERRIDE_BRANCH : getCurrentBranch();
const isReleaseBranch = currentBranch === 'main' || currentBranch === 'master' || currentBranch.startsWith('release/');
const isStrictMode = isStrictArg || isReleaseBranch;

console.log('================================================================');
console.log(' CSI GCET SB — Content & Compliance Scan');
console.log(` Branch: ${currentBranch} | Mode: ${isStrictMode ? 'STRICT (Fail on violation)' : 'WARN (Development)'}`);
console.log(' Target:', SCAN_DIR);
console.log('================================================================\n');

const files = getAllFiles(SCAN_DIR);
const findings = [];

for (const filePath of files) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, lineIndex) => {
    for (const check of CHECKS) {
      let match;
      const regex = new RegExp(check.pattern.source, check.pattern.flags);
      while ((match = regex.exec(line)) !== null) {
        findings.push({
          file: relative(ROOT_DIR, filePath),
          line: lineIndex + 1,
          type: check.id,
          description: check.description,
          matched: match[0],
          preview: line.trim()
        });
      }
    }
  });
}

console.log(`Scanned ${files.length} file(s) in apps/web/src.\n`);

if (findings.length === 0) {
  console.log('[PASS] No placeholder content, dead hrefs, or banned compliance claims found.');
  process.exit(0);
} else {
  console.log(`Found ${findings.length} content issue(s):`);
  findings.forEach((f) => {
    const prefix = isStrictMode ? '[FAIL]' : '[WARN]';
    console.log(`  ${prefix} ${f.file}:${f.line} [${f.type}] - "${f.matched}"`);
    console.log(`         Line: ${f.preview}`);
  });

  if (isStrictMode) {
    console.error('\n[ERROR] Content check failed under strict/release mode.');
    process.exit(1);
  } else {
    console.warn('\n[WARNING] Content check reported warnings (allowed on development branches).');
    process.exit(0);
  }
}

