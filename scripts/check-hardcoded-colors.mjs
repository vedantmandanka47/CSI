#!/usr/bin/env node
/**
 * CSI GCET SB — Hardcoded Color Checker (Section 7.8)
 * Fails CI if any .tsx, .ts, or .css file outside tokens.css contains
 * a hex, rgb(), or hsl() color literal.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative, normalize } from 'node:path';

const ROOT_DIR = resolve('.');
const DIRS_TO_SCAN = [
  join(ROOT_DIR, 'apps', 'web', 'src'),
  join(ROOT_DIR, 'packages', 'shared', 'src')
];

// Explicit allowlist / skip list
const EXEMPT_FILE_SUFFIXES = ['tokens.css'];

// Matches hex colors: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

// Matches rgb/rgba and hsl/hsla function calls
const FUNCTIONAL_COLOR_REGEX = /\b(?:rgb|rgba|hsl|hsla)\s*\([^)]+\)/gi;

function getAllSourceFiles(dir) {
  let results = [];
  try {
    const list = readdirSync(dir);
    for (const file of list) {
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (!['node_modules', '.next', 'dist', 'coverage'].includes(file)) {
          results = results.concat(getAllSourceFiles(fullPath));
        }
      } else if (/\.(tsx|ts|css)$/.test(file)) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Error reading directory ${dir}:`, err.message);
    }
  }
  return results;
}

function stripComments(content) {
  // Replace block comments and line comments with whitespace preserving line numbers
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, (match) => ' '.repeat(match.length));
}

let violationCount = 0;
const scannedFiles = [];

for (const dir of DIRS_TO_SCAN) {
  const files = getAllSourceFiles(dir);
  for (const filePath of files) {
    const normalized = normalize(filePath);
    const isExempt = EXEMPT_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
    if (isExempt) {
      continue;
    }

    scannedFiles.push(filePath);
    const rawContent = readFileSync(filePath, 'utf-8');
    const sanitizedContent = stripComments(rawContent);
    const lines = sanitizedContent.split('\n');

    lines.forEach((line, index) => {
      // Check for hex colors
      let match;
      while ((match = HEX_COLOR_REGEX.exec(line)) !== null) {
        // Exclude common false positives like HTML entities or anchor links
        const charBefore = index > 0 && match.index > 0 ? line[match.index - 1] : '';
        if (charBefore === '&') continue;

        console.error(
          `[FAIL] Hardcoded hex color "${match[0]}" found in ${relative(ROOT_DIR, filePath)}:${index + 1}`
        );
        violationCount++;
      }

      // Check for functional colors
      while ((match = FUNCTIONAL_COLOR_REGEX.exec(line)) !== null) {
        console.error(
          `[FAIL] Hardcoded functional color "${match[0]}" found in ${relative(ROOT_DIR, filePath)}:${index + 1}`
        );
        violationCount++;
      }
    });
  }
}

console.log(`\nChecked ${scannedFiles.length} source file(s) for hardcoded colors.`);

if (violationCount > 0) {
  console.error(`\nFound ${violationCount} hardcoded color violation(s).`);
  console.error('All colors MUST be defined as CSS tokens in apps/web/src/styles/tokens.css');
  process.exit(1);
} else {
  console.log('[PASS] Zero hardcoded color literals found outside tokens.css.');
  process.exit(0);
}

