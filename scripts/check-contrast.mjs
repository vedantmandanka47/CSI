#!/usr/bin/env node
/**
 * CSI GCET SB — WCAG Contrast Ratio Checker (Section 7.8 & Section 7.10 UI-03)
 * Parses apps/web/src/styles/tokens.css and verifies WCAG 2.2 AA contrast ratios
 * for all defined token pairings across light and dark themes.
 */

import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const TOKENS_PATH = resolve(join('apps', 'web', 'src', 'styles', 'tokens.css'));

function parseHex(hexStr) {
  let clean = hexStr.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length !== 6) {
    throw new Error(`Unsupported hex color: "${hexStr}"`);
  }
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return { r, g, b };
}

function channelLuminance(channel) {
  const norm = channel / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

function calculateRelativeLuminance({ r, g, b }) {
  const rLin = channelLuminance(r);
  const gLin = channelLuminance(g);
  const bLin = channelLuminance(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function getContrastRatio(hex1, hex2) {
  const lum1 = calculateRelativeLuminance(parseHex(hex1));
  const lum2 = calculateRelativeLuminance(parseHex(hex2));
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

function extractTokens(cssContent) {
  const rootMatch = cssContent.match(/:root\s*\{([\s\S]*?)\}/);
  const darkMatch = cssContent.match(/(?:\[data-theme=['"]dark['"]\]|\.dark)\s*\{([\s\S]*?)\}/);

  if (!rootMatch || !darkMatch) {
    throw new Error('Failed to parse :root or dark theme token blocks from tokens.css');
  }

  const parseBlock = (block) => {
    const tokens = {};
    const lines = block.split('\n');
    for (const line of lines) {
      const match = line.match(/(--[a-zA-Z0-9_-]+)\s*:\s*(#[0-9a-fA-F]{3,8});/);
      if (match) {
        tokens[match[1]] = match[2];
      }
    }
    return tokens;
  };

  return {
    light: parseBlock(rootMatch[1]),
    dark: parseBlock(darkMatch[1])
  };
}

console.log('================================================================');
console.log(' CSI GCET SB — WCAG 2.2 AA Contrast Ratio Verification');
console.log(' Token Source:', TOKENS_PATH);
console.log('================================================================\n');

const cssContent = readFileSync(TOKENS_PATH, 'utf-8');
const { light, dark } = extractTokens(cssContent);

// Required pairings to check and minimum WCAG ratio
// 4.5:1 for body text (WCAG AA), 3.0:1 for large text/graphical UI components
const PAIRINGS = [
  { name: 'Text on Canvas (bg)', fg: '--color-text', bg: '--color-bg', minRatio: 4.5 },
  { name: 'Text on Surface', fg: '--color-text', bg: '--color-surface', minRatio: 4.5 },
  { name: 'Text on Surface-Raised', fg: '--color-text', bg: '--color-surface-raised', minRatio: 4.5 },
  { name: 'Text-Muted on Surface', fg: '--color-text-muted', bg: '--color-surface', minRatio: 4.5 },
  { name: 'On-Primary on Primary', fg: '--color-on-primary', bg: '--color-primary', minRatio: 4.5 },
  { name: 'On-Accent on Accent', fg: '--color-on-accent', bg: '--color-accent', minRatio: 4.5 }
];

let failedCount = 0;

function runCheck(themeName, tokens) {
  console.log(`Checking ${themeName.toUpperCase()} Theme:`);
  for (const { name, fg, bg, minRatio } of PAIRINGS) {
    const fgColor = tokens[fg];
    const bgColor = tokens[bg];

    if (!fgColor || !bgColor) {
      console.error(`  [ERROR] Missing token definition: ${fg} or ${bg}`);
      failedCount++;
      continue;
    }

    const ratio = getContrastRatio(fgColor, bgColor);
    const passed = ratio >= minRatio;
    const formattedRatio = `${ratio.toFixed(2)}:1`;

    if (passed) {
      console.log(
        `  [PASS] ${name.padEnd(25)} ${formattedRatio.padEnd(10)} (${fgColor} on ${bgColor}, target >= ${minRatio}:1)`
      );
    } else {
      console.error(
        `  [FAIL] ${name.padEnd(25)} ${formattedRatio.padEnd(10)} (${fgColor} on ${bgColor}, target >= ${minRatio}:1)`
      );
      failedCount++;
    }
  }
  console.log('');
}

runCheck('Light', light);
runCheck('Dark', dark);

if (failedCount > 0) {
  console.error(`[FAIL] ${failedCount} token contrast pairing(s) failed WCAG 2.2 AA requirements.`);
  process.exit(1);
} else {
  console.log('[PASS] All token pairings satisfy WCAG 2.2 AA contrast requirements.');
  process.exit(0);
}
