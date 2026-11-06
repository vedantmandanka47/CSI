/**
 * CSI GCET Student Branch Platform — Database Backup Utility (Module M19)
 *
 * Automates PostgreSQL database backup generation, archive integrity verification,
 * storage asset packaging, manifest tracking, and retention cleanup.
 *
 * Usage:
 *   npx tsx scripts/database/backup.ts [options]
 *
 * Options:
 *   --database <name>     Source database name (default: csi_gcet_dev)
 *   --output <dir>        Backup output directory (default: storage/backups)
 *   --keep <count>        Number of recent backups to retain (default: 7)
 *   --no-storage          Skip packaging file storage (certificates, passports, assets)
 *   --verify-only <file>  Verify an existing backup archive and manifest
 *   --json                Output result manifest as JSON to stdout
 *   --help                Display this help message
 */

import { execFileSync, execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import dotenv from 'dotenv';
import { Client } from 'pg';

// Load environment variables from apps/api/.env if available
const apiEnvPath = resolve(join('apps', 'api', '.env'));
dotenv.config({ path: apiEnvPath });

export interface BackupToolVersions {
  pgDump: string;
  node: string;
  platform: string;
}

export interface StorageFileEntry {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

export interface StorageRestoreVerificationResult {
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'N/A';
  extractedFileCount: number;
  expectedFileCount: number;
  checksumMatches: number;
  corruptedFiles: string[];
  missingFiles: string[];
  unexpectedFiles: string[];
  verifiedDirectories: string[];
}

export interface BackupManifest {
  backupId: string;
  timestamp: string;
  sourceDatabase: string;
  format: 'pg_dump_custom';
  archiveFilename: string;
  archiveSizeBytes: number;
  archiveSha256: string;
  storageFilename?: string;
  storageSizeBytes?: number;
  storageSha256?: string;
  storageFileCount?: number;
  storageSourcePath?: string;
  storageFileManifest?: StorageFileEntry[];
  migrationVersion: string;
  tableCount: number;
  tables: string[];
  recordCounts: Record<string, number>;
  toolVersions: BackupToolVersions;
  verificationStatus: 'VERIFIED' | 'FAILED' | 'PENDING';
  verifiedAt?: string;
}

export interface BackupOptions {
  database: string;
  outputDir: string;
  keepCount: number;
  includeStorage: boolean;
  storageDir?: string;
  verifyOnlyFile?: string;
  jsonOutput: boolean;
}

/**
 * Resolves the effective file storage directory used for backing up application assets (certificates, passports, workspaces).
 * Prioritizes custom parameter, then STORAGE_ROOT_DIR, and falls back to standard workspace development paths.
 */
export function resolveEffectiveStorageDir(customDir?: string): { dir: string; isConfigured: boolean } {
  if (customDir && customDir.trim().length > 0) {
    return { dir: resolve(customDir.trim()), isConfigured: true };
  }
  if (process.env.STORAGE_ROOT_DIR && process.env.STORAGE_ROOT_DIR.trim().length > 0) {
    return { dir: resolve(process.env.STORAGE_ROOT_DIR.trim()), isConfigured: true };
  }
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, 'apps', 'api', 'storage'))) {
    return { dir: resolve(cwd, 'apps', 'api', 'storage'), isConfigured: false };
  }
  if (existsSync(resolve(cwd, 'storage'))) {
    return { dir: resolve(cwd, 'storage'), isConfigured: false };
  }
  return { dir: resolve(cwd, 'apps', 'api', 'storage'), isConfigured: false };
}

/**
 * Counts all files recursively within a directory.
 */
export function countFilesInDir(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;
  let count = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += countFilesInDir(full);
      } else if (entry.isFile()) {
        count++;
      }
    }
  } catch {
    // return accumulated count
  }
  return count;
}

export interface SafeTarEntry {
  path: string;
  size: number;
  typeflag: string;
  isRegularFile: boolean;
  isDirectory: boolean;
  linkname?: string;
}

/**
 * Validates a single archive member path against cross-platform directory traversal,
 * absolute paths (POSIX and Windows), drive letters, UNC paths, DOS reserved device names,
 * trailing spaces/dots, and control characters.
 */
export function validateSafeArchiveMemberPath(
  rawPath: string,
  destinationDir?: string,
): { valid: boolean; normalizedPath: string; error?: string } {
  // 1. Must not contain null bytes or control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f-\x9f]/.test(rawPath)) {
    return {
      valid: false,
      normalizedPath: '',
      error: `Unsafe characters or control codes detected in archive member path: ${JSON.stringify(rawPath)}`,
    };
  }

  // 2. Normalize slashes
  const normalized = rawPath.replace(/\\/g, '/').trim();
  if (normalized.length === 0) {
    return {
      valid: false,
      normalizedPath: '',
      error: 'Empty archive member path.',
    };
  }

  // 3. Absolute path checks (POSIX root, Windows drive letter, Windows UNC, Windows device prefix)
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('\\') ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.startsWith('//') ||
    normalized.startsWith('\\\\') ||
    /^[a-zA-Z]:[\\/]/.test(rawPath)
  ) {
    return {
      valid: false,
      normalizedPath: normalized,
      error: `Unsafe absolute path detected in archive: "${rawPath}"`,
    };
  }

  // 4. Split segments and check traversal, trailing dots, and DOS device names
  const segments = normalized.split('/').filter((s) => s.length > 0);
  for (const seg of segments) {
    // Parent directory traversal
    if (seg === '..') {
      return {
        valid: false,
        normalizedPath: normalized,
        error: `Unsafe path traversal ("..") detected in archive entry: "${rawPath}"`,
      };
    }
    // Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(seg)) {
      return {
        valid: false,
        normalizedPath: normalized,
        error: `Unsafe reserved device name detected in archive entry: "${seg}" in "${rawPath}"`,
      };
    }
    // Trailing dot or space in segment (Windows filesystem bypass vector)
    if (/[. ]$/.test(seg)) {
      return {
        valid: false,
        normalizedPath: normalized,
        error: `Unsafe trailing dot or space in path segment: "${seg}" in "${rawPath}"`,
      };
    }
  }

  // 5. Canonical jail containment check against destinationDir if provided
  if (destinationDir) {
    const canonicalDest = resolve(destinationDir);
    const resolvedPath = resolve(canonicalDest, normalized);
    const rel = relative(canonicalDest, resolvedPath);
    if (rel.startsWith('..') || isAbsolute(rel) || (resolvedPath === canonicalDest && !normalized.endsWith('/'))) {
      return {
        valid: false,
        normalizedPath: normalized,
        error: `Archive entry "${rawPath}" escapes destination directory "${canonicalDest}"`,
      };
    }
  }

  return { valid: true, normalizedPath: segments.join('/') };
}

export const MAX_DECOMPRESSED_ARCHIVE_BYTES = 250 * 1024 * 1024; // 250 MB
export const MAX_ARCHIVE_MEMBER_COUNT = 5000;
export const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Calculates POSIX/USTAR tar header checksum according to the standard:
 * sum of all 512 bytes treating bytes 148..155 (chksum field) as ASCII spaces (0x20).
 * Handles both unsigned byte sums and signed byte sums (used in older BSD tar).
 */
export function calculateTarHeaderChecksum(block: Buffer): { unsigned: number; signed: number } {
  let unsigned = 0;
  let signed = 0;
  for (let i = 0; i < 512; i++) {
    const val = i >= 148 && i < 156 ? 0x20 : (block[i] ?? 0);
    unsigned += val;
    signed += val > 127 ? val - 256 : val;
  }
  return { unsigned, signed };
}

/**
 * Parses PAX extended header records formatted as: "${length} ${key}=${value}\n"
 */
export function parsePaxAttributes(data: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let pos = 0;
  while (pos < data.length) {
    const spaceIdx = data.indexOf(' ', pos);
    if (spaceIdx === -1) break;
    const lenStr = data.slice(pos, spaceIdx);
    const len = parseInt(lenStr, 10);
    if (Number.isNaN(len) || len <= 0 || pos + len > data.length) break;
    const record = data.slice(spaceIdx + 1, pos + len).replace(/\n$/, '');
    const eqIdx = record.indexOf('=');
    if (eqIdx !== -1) {
      const key = record.slice(0, eqIdx);
      const val = record.slice(eqIdx + 1);
      attrs[key] = val;
    }
    pos += len;
  }
  return attrs;
}

/**
 * Format-aware binary parser for USTAR/GNU/PAX tar archives.
 * Decompresses gzip stream if needed with strict limits, parses 512-byte header blocks,
 * verifies header checksums, handles PAX attributes and GNU long paths, and strictly
 * validates all entries before any disk write.
 */
export function parseAndValidateTarArchive(
  archivePathOrBuffer: string | Buffer,
  destinationDir?: string,
): {
  safe: boolean;
  error?: string;
  entries: SafeTarEntry[];
} {
  try {
    let tarBuffer: Buffer;
    if (typeof archivePathOrBuffer === 'string') {
      if (!existsSync(archivePathOrBuffer)) {
        return { safe: false, error: 'Storage archive file not found', entries: [] };
      }
      const raw = readFileSync(archivePathOrBuffer);
      if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
        try {
          tarBuffer = gunzipSync(raw, { maxOutputLength: MAX_DECOMPRESSED_ARCHIVE_BYTES });
        } catch (gzErr: unknown) {
          return {
            safe: false,
            error: `Corrupted gzip archive or decompression limit exceeded: ${gzErr instanceof Error ? gzErr.message : String(gzErr)}`,
            entries: [],
          };
        }
      } else {
        tarBuffer = raw;
      }
    } else {
      const raw = archivePathOrBuffer;
      if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
        try {
          tarBuffer = gunzipSync(raw, { maxOutputLength: MAX_DECOMPRESSED_ARCHIVE_BYTES });
        } catch (gzErr: unknown) {
          return {
            safe: false,
            error: `Corrupted gzip archive or decompression limit exceeded: ${gzErr instanceof Error ? gzErr.message : String(gzErr)}`,
            entries: [],
          };
        }
      } else {
        tarBuffer = raw;
      }
    }

    if (tarBuffer.length < 512) {
      return {
        safe: false,
        error: 'Malformed archive: file smaller than minimum 512-byte block size',
        entries: [],
      };
    }

    const entries: SafeTarEntry[] = [];
    const seenPaths = new Set<string>();
    const seenDirs = new Set<string>();
    let offset = 0;
    let pendingLongPath: string | null = null;

    while (offset + 512 <= tarBuffer.length) {
      const block = tarBuffer.subarray(offset, offset + 512);
      // End-of-Archive (EOF): two consecutive 512-byte blocks of zeroes
      if (block.every((b) => b === 0)) {
        break;
      }

      // Check member count limit (zip bomb guard)
      if (entries.length >= MAX_ARCHIVE_MEMBER_COUNT) {
        return {
          safe: false,
          error: `Archive contains too many file members (exceeds maximum safety limit of ${MAX_ARCHIVE_MEMBER_COUNT})`,
          entries: [],
        };
      }

      // Validate header checksum if USTAR or checksum field is non-empty
      const chksumStr = block.subarray(148, 156).toString('utf8').trim().replace(/\0.*$/, '');
      const expectedChksum = parseInt(chksumStr, 8);
      if (!Number.isNaN(expectedChksum)) {
        const computed = calculateTarHeaderChecksum(block);
        if (expectedChksum !== computed.unsigned && expectedChksum !== computed.signed) {
          return {
            safe: false,
            error: `Corrupted tar archive header: checksum mismatch at offset ${offset} (expected ${expectedChksum}, computed unsigned ${computed.unsigned}, signed ${computed.signed})`,
            entries: [],
          };
        }
      }

      // 1. Extract raw name and prefix
      let name = block.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
      const prefix = block.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
      if (prefix && prefix.length > 0) {
        name = `${prefix}/${name}`;
      }

      // If preceding block was GNU LongPath ('L'), use it
      if (pendingLongPath) {
        name = pendingLongPath;
        pendingLongPath = null;
      }

      // 2. Type flag
      const typeflagChar = String.fromCharCode(block[156] || 0);

      // 3. Size
      const sizeStr = block.subarray(124, 136).toString('utf8').trim().replace(/\0.*$/, '');
      const size = parseInt(sizeStr, 8) || 0;
      if (size < 0 || Number.isNaN(size)) {
        return {
          safe: false,
          error: `Malformed archive entry "${name}": invalid negative or unparseable byte size (${sizeStr})`,
          entries: [],
        };
      }

      // Single file size limit guard
      if (size > MAX_SINGLE_FILE_BYTES) {
        return {
          safe: false,
          error: `Archive entry "${name}" byte size (${size.toLocaleString()} bytes) exceeds maximum single-file safety limit of ${MAX_SINGLE_FILE_BYTES.toLocaleString()} bytes`,
          entries: [],
        };
      }

      // 4. Link name
      const linkname = block.subarray(157, 257).toString('utf8').replace(/\0.*$/, '');

      // Handle GNU Long Path pseudo-entry ('L')
      if (typeflagChar === 'L') {
        const dataOffset = offset + 512;
        const dataBlocks = Math.ceil(size / 512) * 512;
        if (dataOffset + size > tarBuffer.length) {
          return { safe: false, error: 'Malformed archive: truncated GNU long path data', entries: [] };
        }
        pendingLongPath = tarBuffer.subarray(dataOffset, dataOffset + size).toString('utf8').replace(/\0.*$/, '');
        offset = dataOffset + dataBlocks;
        continue;
      }

      // Handle GNU Long Link target ('K') -> forbidden because links are forbidden
      if (typeflagChar === 'K') {
        return {
          safe: false,
          error: 'Unsafe archive entry: GNU long link target is forbidden in storage archives',
          entries: [],
        };
      }

      // Handle PAX extended header ('x' or 'g')
      if (typeflagChar === 'x' || typeflagChar === 'g') {
        const dataOffset = offset + 512;
        const dataBlocks = Math.ceil(size / 512) * 512;
        if (dataOffset + size > tarBuffer.length) {
          return { safe: false, error: 'Malformed archive: truncated PAX header data', entries: [] };
        }
        const paxData = tarBuffer.subarray(dataOffset, dataOffset + size).toString('utf8');
        const paxAttrs = parsePaxAttributes(paxData);
        if (paxAttrs.linkpath) {
          return {
            safe: false,
            error: `Unsafe archive entry: PAX linkpath detected ("${paxAttrs.linkpath}")`,
            entries: [],
          };
        }
        if (paxAttrs.path) {
          pendingLongPath = paxAttrs.path.trim();
        }
        offset = dataOffset + dataBlocks;
        continue;
      }

      // Reject hard links (typeflag '1')
      if (typeflagChar === '1') {
        return {
          safe: false,
          error: `Unsafe archive entry: hard links are forbidden in storage archives ("${name}")`,
          entries,
        };
      }

      // Reject symlinks (typeflag '2' or non-empty linkname)
      if (typeflagChar === '2' || linkname.length > 0) {
        return {
          safe: false,
          error: `Unsafe archive entry: symbolic links are forbidden in storage archives ("${name}" -> "${linkname}")`,
          entries,
        };
      }

      // Reject special files (character device '3', block device '4', FIFO '6', socket 's')
      if (['3', '4', '6', 's'].includes(typeflagChar)) {
        return {
          safe: false,
          error: `Unsafe archive entry: special device/FIFO/socket files are forbidden in archives ("${name}")`,
          entries,
        };
      }

      const isDirectory = typeflagChar === '5' || name.endsWith('/');
      const isRegularFile = typeflagChar === '0' || typeflagChar === '\0' || typeflagChar === '7';

      if (!isDirectory && !isRegularFile) {
        return {
          safe: false,
          error: `Unsafe archive entry: unsupported tar typeflag "${typeflagChar}" for "${name}"`,
          entries,
        };
      }

      // Path validation
      const pathCheck = validateSafeArchiveMemberPath(name, destinationDir);
      if (!pathCheck.valid) {
        return { safe: false, error: pathCheck.error, entries };
      }

      const normalized = pathCheck.normalizedPath;

      // Duplicate and collision detection across hierarchy
      const pathParts = normalized.split('/');
      let ancestor = '';
      for (let i = 0; i < pathParts.length - 1; i++) {
        ancestor = ancestor ? `${ancestor}/${pathParts[i]}` : (pathParts[i] || '');
        if (seenPaths.has(ancestor)) {
          return {
            safe: false,
            error: `Unsafe archive entry: path "${normalized}" collides with previously defined file "${ancestor}"`,
            entries,
          };
        }
        seenDirs.add(ancestor);
      }

      if (isRegularFile) {
        if (seenPaths.has(normalized)) {
          return {
            safe: false,
            error: `Unsafe archive entry: duplicate file path detected in archive: "${normalized}"`,
            entries,
          };
        }
        if (seenDirs.has(normalized)) {
          return {
            safe: false,
            error: `Unsafe archive entry: file path collides with previously defined directory: "${normalized}"`,
            entries,
          };
        }
        seenPaths.add(normalized);
      } else if (isDirectory) {
        if (seenPaths.has(normalized)) {
          return {
            safe: false,
            error: `Unsafe archive entry: directory path collides with previously defined file: "${normalized}"`,
            entries,
          };
        }
        seenDirs.add(normalized);
      }

      entries.push({
        path: normalized,
        size,
        typeflag: typeflagChar,
        isRegularFile,
        isDirectory,
      });

      // Skip past header and file data blocks (with truncation bounds check)
      const dataBlocks = Math.ceil(size / 512) * 512;
      if (offset + 512 + dataBlocks > tarBuffer.length && size > 0) {
        return {
          safe: false,
          error: `Malformed archive: truncated data block for entry "${normalized}" (expected ${size} bytes)`,
          entries: [],
        };
      }
      offset += 512 + dataBlocks;
    }

    return { safe: true, entries };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { safe: false, error: msg, entries: [] };
  }
}

/**
 * Safely extracts a verified storage tar.gz archive into destinationDir.
 * All entries are verified upfront before any disk write.
 * Regular files are written with exclusive mode ({ flag: 'wx' }) preventing overwrites.
 * Verifies canonical path containment and runs post-extraction disk guards.
 */
export function safeExtractStorageArchive(
  archivePath: string,
  destinationDir: string,
): { success: boolean; extractedFiles: string[]; error?: string } {
  // 1. Full binary parse and upfront pre-extraction validation
  const validation = parseAndValidateTarArchive(archivePath, destinationDir);
  if (!validation.safe) {
    return { success: false, extractedFiles: [], error: validation.error };
  }

  const canonicalDest = resolve(destinationDir);
  if (!existsSync(canonicalDest)) {
    mkdirSync(canonicalDest, { recursive: true, mode: 0o700 });
  }

  const extractedFiles: string[] = [];

  try {
    const raw = readFileSync(archivePath);
    const tarBuffer =
      raw[0] === 0x1f && raw[1] === 0x8b
        ? gunzipSync(raw, { maxOutputLength: MAX_DECOMPRESSED_ARCHIVE_BYTES })
        : raw;

    let offset = 0;
    let pendingLongPath: string | null = null;

    while (offset + 512 <= tarBuffer.length) {
      const block = tarBuffer.subarray(offset, offset + 512);
      if (block.every((b) => b === 0)) break;

      let name = block.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
      const prefix = block.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
      if (prefix && prefix.length > 0) name = `${prefix}/${name}`;
      if (pendingLongPath) {
        name = pendingLongPath;
        pendingLongPath = null;
      }

      const typeflagChar = String.fromCharCode(block[156] || 0);
      const sizeStr = block.subarray(124, 136).toString('utf8').trim().replace(/\0.*$/, '');
      const size = parseInt(sizeStr, 8) || 0;

      if (typeflagChar === 'L') {
        const dataOffset = offset + 512;
        pendingLongPath = tarBuffer.subarray(dataOffset, dataOffset + size).toString('utf8').replace(/\0.*$/, '');
        offset = dataOffset + Math.ceil(size / 512) * 512;
        continue;
      }
      if (typeflagChar === 'x' || typeflagChar === 'g') {
        const dataOffset = offset + 512;
        const paxData = tarBuffer.subarray(dataOffset, dataOffset + size).toString('utf8');
        const pathMatch = paxData.match(/\d+\s+path=(.+)\n/);
        if (pathMatch && pathMatch[1]) pendingLongPath = pathMatch[1].trim();
        offset = dataOffset + Math.ceil(size / 512) * 512;
        continue;
      }

      const isDirectory = typeflagChar === '5' || name.endsWith('/');
      const isRegularFile = typeflagChar === '0' || typeflagChar === '\0' || typeflagChar === '7';
      const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
      const fullTarget = resolve(canonicalDest, normalized);

      // Verify canonical destination containment again immediately before write
      const rel = relative(canonicalDest, fullTarget);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(`Target path "${fullTarget}" escapes destination directory "${canonicalDest}"`);
      }

      if (isDirectory) {
        if (!existsSync(fullTarget)) {
          mkdirSync(fullTarget, { recursive: true, mode: 0o700 });
        }
      } else if (isRegularFile) {
        const parentDir = dirname(fullTarget);
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true, mode: 0o700 });
        }
        const fileContent = tarBuffer.subarray(offset + 512, offset + 512 + size);
        // Exclusive write: fails if file already exists ({ flag: 'wx' })
        writeFileSync(fullTarget, fileContent, { flag: 'wx', mode: 0o600 });
        extractedFiles.push(normalized);
      }

      offset += 512 + Math.ceil(size / 512) * 512;
    }

    // 2. Post-extraction recursive disk guard
    const diskGuard = verifyNoSymlinksOrEscapes(canonicalDest);
    if (!diskGuard.safe) {
      throw new Error(`Post-extraction disk security check failed: ${diskGuard.error}`);
    }

    return { success: true, extractedFiles };
  } catch (extractErr: unknown) {
    const msg = extractErr instanceof Error ? extractErr.message : String(extractErr);
    return { success: false, extractedFiles, error: msg };
  }
}

/**
 * Validates tar archive member paths and entry types for path traversal, symlinks, hardlinks,
 * absolute paths, or unsafe characters.
 * Rejects symbolic links, hard links, special device nodes, absolute paths, and parent traversal ('..').
 */
export function validateArchiveMemberPaths(
  archivePath: string,
  destinationDir?: string,
): {
  safe: boolean;
  error?: string;
  entries: string[];
} {
  try {
    if (!existsSync(archivePath)) {
      return { safe: false, error: 'Storage archive file not found', entries: [] };
    }

    // 1. First attempt format-aware binary inspection if archive is a valid tar/gzip file
    try {
      const raw = readFileSync(archivePath);
      // Valid gzip (0x1f, 0x8b) or tar block size divisible by 512
      if ((raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) || raw.length >= 512) {
        const binaryCheck = parseAndValidateTarArchive(archivePath, destinationDir);
        if (!binaryCheck.safe) {
          return { safe: false, error: binaryCheck.error, entries: [] };
        }
        return { safe: true, entries: binaryCheck.entries.map((e) => e.path) };
      }
    } catch {
      // Fall through to CLI output parser for test mocks
    }

    // 2. Inspect archive via verbose flag -tzvf (supports CLI mocking in unit tests)
    const output = execFileSync('tar', ['-tzvf', archivePath], { stdio: 'pipe' }).toString();
    const rawLines = output.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    const entries: string[] = [];

    for (const raw of rawLines) {
      // Check for symbolic links (starts with 'l' or contains arrow)
      if (raw.startsWith('l') || raw.includes(' -> ')) {
        return {
          safe: false,
          error: `Unsafe archive entry: symbolic links are forbidden in storage archives ("${raw}")`,
          entries,
        };
      }

      // Check for hard links (starts with 'h' or contains ' link to ')
      if (raw.startsWith('h') || raw.includes(' link to ')) {
        return {
          safe: false,
          error: `Unsafe archive entry: hard links are forbidden in storage archives ("${raw}")`,
          entries,
        };
      }

      // Check for special files (character/block devices, FIFOs, sockets) - only if 10-char mode string matches
      if (/^[cbps][rwxstST-]{9}\s+/.test(raw)) {
        return {
          safe: false,
          error: `Unsafe archive entry: special device/FIFO/socket files are forbidden in archives ("${raw}")`,
          entries,
        };
      }

      // Extract entry path (token(s) after timestamp in verbose mode, or raw line)
      let entryPath = raw;
      if (/^[dlcbpsh-][rwxstST-]{9}\s+/.test(raw)) {
        const match = raw.match(/\d{2}:\d{2}(?::\d{2})?\s+(.+)$/);
        entryPath = match && match[1] ? match[1].trim() : raw;
      }

      // Validate through strict path validator
      const pathCheck = validateSafeArchiveMemberPath(entryPath, destinationDir);
      if (!pathCheck.valid) {
        return { safe: false, error: pathCheck.error, entries };
      }

      entries.push(pathCheck.normalizedPath);
    }

    return { safe: true, entries };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { safe: false, error: msg, entries: [] };
  }
}

/**
 * Recursively verifies that an extracted directory contains no symbolic links,
 * junctions, special device nodes, or paths escaping baseDir.
 */
export function verifyNoSymlinksOrEscapes(
  targetDir: string,
  baseDir: string = targetDir,
): { safe: boolean; error?: string } {
  if (!existsSync(targetDir)) {
    return { safe: false, error: `Directory does not exist: ${targetDir}` };
  }

  const canonicalBase = resolve(baseDir);

  function walk(currentDir: string): { safe: boolean; error?: string } {
    let items;
    try {
      items = readdirSync(currentDir);
    } catch (readErr: unknown) {
      return {
        safe: false,
        error: `Failed to read directory "${currentDir}": ${readErr instanceof Error ? readErr.message : String(readErr)}`,
      };
    }

    for (const name of items) {
      const fullPath = join(currentDir, name);
      let lstat;
      try {
        lstat = lstatSync(fullPath);
      } catch (lstatErr: unknown) {
        return {
          safe: false,
          error: `Failed to lstat file "${fullPath}": ${lstatErr instanceof Error ? lstatErr.message : String(lstatErr)}`,
        };
      }

      // 1. Explicitly reject symbolic links & junctions
      if (lstat.isSymbolicLink()) {
        return {
          safe: false,
          error: `Unsafe symbolic link detected on disk at "${fullPath}". Symlinks are strictly forbidden.`,
        };
      }

      // 2. Reject special device files
      if (lstat.isSocket() || lstat.isFIFO() || lstat.isCharacterDevice() || lstat.isBlockDevice()) {
        return {
          safe: false,
          error: `Unsafe special device file detected on disk at "${fullPath}".`,
        };
      }

      // 3. Verify realpath does not escape canonicalBase
      try {
        const real = realpathSync(fullPath);
        const rel = relative(canonicalBase, real);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return {
            safe: false,
            error: `Extracted path "${fullPath}" canonical realpath "${real}" escapes destination "${canonicalBase}".`,
          };
        }
      } catch (realErr: unknown) {
        return {
          safe: false,
          error: `Failed to resolve realpath for "${fullPath}": ${realErr instanceof Error ? realErr.message : String(realErr)}`,
        };
      }

      if (lstat.isDirectory()) {
        const sub = walk(fullPath);
        if (!sub.safe) return sub;
      }
    }
    return { safe: true };
  }

  return walk(canonicalBase);
}

/**
 * Verifies tar archive integrity, member paths, and lists entries.
 */
export function verifyStorageArchive(archivePath: string): { valid: boolean; entryCount: number; error?: string } {
  const pathValidation = validateArchiveMemberPaths(archivePath);
  if (!pathValidation.safe) {
    return { valid: false, entryCount: 0, error: pathValidation.error };
  }
  return { valid: true, entryCount: pathValidation.entries.length };
}

/**
 * Collects a cryptographic file manifest (relative path, byte size, SHA-256)
 * of all files within a storage directory for deep restore integrity verification.
 * Fails visibly if any file is unreadable, a symbolic link, or an unsupported special file.
 */
export function collectStorageManifest(storageDir: string, currentSubDir: string = ''): StorageFileEntry[] {
  if (!existsSync(storageDir)) return [];
  const targetDir = currentSubDir ? join(storageDir, currentSubDir) : storageDir;
  if (!existsSync(targetDir)) return [];

  const entries: StorageFileEntry[] = [];
  const items = readdirSync(targetDir, { withFileTypes: true });

  for (const item of items) {
    const rel = currentSubDir ? `${currentSubDir}/${item.name}` : item.name;
    const normalizedRel = rel.replace(/\\/g, '/');
    const full = join(storageDir, rel);

    // 1. Explicitly reject symbolic links (Requirement 6)
    if (item.isSymbolicLink()) {
      throw new Error(
        `[SECURITY FATAL] Symbolic link detected at "${normalizedRel}". Symbolic links within storage directory are strictly prohibited.`,
      );
    }

    // 2. Reject unsupported special files (FIFO, socket, character/block devices)
    if (item.isSocket() || item.isFIFO() || item.isCharacterDevice() || item.isBlockDevice()) {
      throw new Error(
        `[SECURITY FATAL] Unsupported special file detected at "${normalizedRel}". Storage directory may only contain standard files and directories.`,
      );
    }

    if (item.isDirectory()) {
      entries.push(...collectStorageManifest(storageDir, rel));
    } else if (item.isFile()) {
      try {
        const stats = statSync(full);
        const hash = calculateSha256(full);
        entries.push({
          relativePath: normalizedRel,
          sizeBytes: stats.size,
          sha256: hash,
        });
      } catch (err: unknown) {
        throw new Error(
          `[SECURITY FATAL] Failed to read storage file "${normalizedRel}": ${err instanceof Error ? err.message : String(err)}. Backup creation aborted to prevent incomplete manifest.`,
        );
      }
    }
  }

  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Deep cryptographic verification of an extracted storage directory against the backup manifest.
 * Compares exact file inventory, checks every file's SHA-256, and detects missing, unexpected, or altered files.
 */
export function verifyExtractedStorage(
  extractedDir: string,
  manifestEntries: StorageFileEntry[],
): StorageRestoreVerificationResult {
  if (!existsSync(extractedDir)) {
    return {
      status: 'FAIL',
      extractedFileCount: 0,
      expectedFileCount: manifestEntries.length,
      checksumMatches: 0,
      corruptedFiles: [],
      missingFiles: manifestEntries.map((e) => e.relativePath),
      unexpectedFiles: [],
      verifiedDirectories: [],
    };
  }

  const diskEntries = collectStorageManifest(extractedDir);
  const diskMap = new Map(diskEntries.map((e) => [e.relativePath, e]));
  const manifestMap = new Map(manifestEntries.map((e) => [e.relativePath, e]));

  const missingFiles: string[] = [];
  const corruptedFiles: string[] = [];
  let checksumMatches = 0;

  for (const [relPath, mEntry] of manifestMap.entries()) {
    const dEntry = diskMap.get(relPath);
    if (!dEntry) {
      missingFiles.push(relPath);
    } else if (dEntry.sha256 !== mEntry.sha256 || dEntry.sizeBytes !== mEntry.sizeBytes) {
      corruptedFiles.push(relPath);
    } else {
      checksumMatches++;
    }
  }

  const unexpectedFiles: string[] = [];
  for (const [relPath] of diskMap.entries()) {
    if (!manifestMap.has(relPath)) {
      unexpectedFiles.push(relPath);
    }
  }

  const verifiedDirectories = Array.from(
    new Set(
      diskEntries
        .map((e) => {
          const parts = e.relativePath.split('/');
          return parts.length > 1 ? parts[0] : '';
        })
        .filter((d): d is string => Boolean(d && d.length > 0)),
    ),
  );

  const status =
    missingFiles.length === 0 && corruptedFiles.length === 0 && unexpectedFiles.length === 0
      ? 'PASS'
      : 'FAIL';

  return {
    status,
    extractedFileCount: diskEntries.length,
    expectedFileCount: manifestEntries.length,
    checksumMatches,
    corruptedFiles,
    missingFiles,
    unexpectedFiles,
    verifiedDirectories,
  };
}

export function parseArgs(args: string[]): BackupOptions {
  const options: BackupOptions = {
    database: 'csi_gcet_dev',
    outputDir: resolve(join('storage', 'backups')),
    keepCount: 7,
    includeStorage: true,
    jsonOutput: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--database' && i + 1 < args.length) {
      options.database = args[++i] || 'csi_gcet_dev';
    } else if (arg === '--output' && i + 1 < args.length) {
      options.outputDir = resolve(args[++i] || 'storage/backups');
    } else if (arg === '--keep' && i + 1 < args.length) {
      options.keepCount = Math.max(1, parseInt(args[++i] || '7', 10) || 7);
    } else if (arg === '--storage-dir' && i + 1 < args.length) {
      options.storageDir = args[++i];
    } else if (arg === '--no-storage') {
      options.includeStorage = false;
    } else if (arg === '--verify-only' && i + 1 < args.length) {
      options.verifyOnlyFile = resolve(args[++i] || '');
    } else if (arg === '--json') {
      options.jsonOutput = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
CSI GCET SB — Automated Database Backup Utility (M19)

Options:
  --database <name>       Source database name (default: csi_gcet_dev)
  --output <dir>          Backup output directory (default: storage/backups)
  --keep <count>          Number of recent backups to retain (default: 7)
  --storage-dir <dir>     Explicit storage root directory (defaults to STORAGE_ROOT_DIR)
  --no-storage            Skip packaging file storage (certificates, passports, assets)
  --verify-only <file>    Verify an existing backup archive and manifest
  --json                  Output result manifest as JSON to stdout
  --help                  Display this help message
`);
      process.exit(0);
    }
  }

  return options;
}

export function calculateSha256(filePath: string): string {
  const fileBuffer = readFileSync(filePath);
  return createHash('sha256').update(fileBuffer).digest('hex');
}

export function getToolVersions(): BackupToolVersions {
  let pgDumpVersion = 'unknown';
  try {
    const out = execSync('pg_dump --version', { stdio: 'pipe' }).toString().trim();
    pgDumpVersion = out.replace(/^pg_dump\s+\(PostgreSQL\)\s+/, '');
  } catch {
    // ignore
  }

  return {
    pgDump: pgDumpVersion,
    node: process.version,
    platform: process.platform,
  };
}

export function verifyDumpTOC(dumpPath: string): { valid: boolean; entryCount: number; error?: string } {
  try {
    const output = execSync(`pg_restore --list "${dumpPath}"`, { stdio: 'pipe' }).toString();
    const lines = output.split('\n').filter((l) => l.trim().length > 0 && !l.startsWith(';'));
    return { valid: true, entryCount: lines.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, entryCount: 0, error: msg };
  }
}

export async function collectDatabaseMetadata(
  client: Client,
): Promise<{ tableCount: number; tables: string[]; recordCounts: Record<string, number>; migrationVersion: string }> {
  // 1. Tables list
  const tablesRes = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`,
  );
  const tables = tablesRes.rows.map((r) => r.table_name);

  // 2. Sample record counts for key domain tables
  const trackedTables = [
    'users',
    'roles',
    'role_assignments',
    'committees',
    'events',
    'registrations',
    'attendance_sessions',
    'attendance_records',
    'certificates',
    'passports',
    'tasks',
    'checklists',
    'checklist_runs',
    'committee_assets',
    'academic_terms',
    'term_snapshots',
    'term_rollovers',
    'audit_log',
  ];

  const recordCounts: Record<string, number> = {};
  for (const table of trackedTables) {
    if (tables.includes(table)) {
      try {
        const countRes = await client.query<{ count: string }>(`SELECT COUNT(*)::text as count FROM "${table}";`);
        recordCounts[table] = parseInt(countRes.rows[0]?.count || '0', 10);
      } catch {
        recordCounts[table] = -1;
      }
    }
  }

  // 3. Latest migration version
  let migrationVersion = 'unknown';
  if (tables.includes('_prisma_migrations')) {
    try {
      const migRes = await client.query<{ migration_name: string }>(
        `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1;`,
      );
      if (migRes.rows[0]?.migration_name) {
        migrationVersion = migRes.rows[0].migration_name;
      }
    } catch {
      // ignore
    }
  }

  return {
    tableCount: tables.length,
    tables,
    recordCounts,
    migrationVersion,
  };
}

export function enforceRetention(backupDir: string, keepCount: number): string[] {
  if (!existsSync(backupDir)) return [];

  const resolvedDir = resolve(backupDir);
  const files = readdirSync(resolvedDir);
  const dumpFiles = files
    .filter((f) => f.startsWith('csi_backup_') && f.endsWith('.dump'))
    .map((f) => {
      const fullPath = join(resolvedDir, f);
      return {
        name: f,
        fullPath,
        time: statSync(fullPath).mtimeMs,
      };
    })
    .sort((a, b) => b.time - a.time);

  const deletedFiles: string[] = [];
  if (dumpFiles.length > keepCount) {
    const toDelete = dumpFiles.slice(keepCount);
    for (const item of toDelete) {
      const baseName = item.name.replace(/\.dump$/, '');

      // Delete dump, manifest, and storage files safely
      const candidates = [
        item.fullPath,
        join(resolvedDir, `${baseName}.json`),
        join(resolvedDir, `${baseName}.storage.tar.gz`),
      ];

      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          // Verify candidate resides strictly inside the backup directory (jail check)
          const resolvedCandidate = resolve(candidate);
          if (resolvedCandidate.startsWith(resolvedDir)) {
            unlinkSync(candidate);
            deletedFiles.push(basename(candidate));
          }
        }
      }
    }
  }

  return deletedFiles;
}

export async function runBackup(options: BackupOptions): Promise<BackupManifest> {
  const connectionUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionUrl) {
    throw new Error('Neither MIGRATION_DATABASE_URL nor DATABASE_URL is defined.');
  }

  const parsedUrl = new URL(connectionUrl);
  const allowedHosts = ['localhost', '127.0.0.1', '::1'];
  if (!allowedHosts.includes(parsedUrl.hostname)) {
    throw new Error(`[SAFETY FATAL] Host "${parsedUrl.hostname}" is not local. Remote backups are prohibited.`);
  }

  // Ensure output directory exists
  if (!existsSync(options.outputDir)) {
    mkdirSync(options.outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const fileTimestamp = timestamp.replace(/[-:]/g, '').replace(/\..+/, '');
  const backupId = randomUUID();
  const shortId = backupId.slice(0, 8);
  const baseName = `csi_backup_${options.database}_${fileTimestamp}_${shortId}`;
  const dumpFilename = `${baseName}.dump`;
  const dumpFilePath = join(options.outputDir, dumpFilename);
  const manifestFilename = `${baseName}.json`;
  const manifestFilePath = join(options.outputDir, manifestFilename);

  if (!options.jsonOutput) {
    console.log('================================================================');
    console.log(' CSI GCET SB — Automated Database Backup (Module M19)');
    console.log('================================================================');
    console.log(` Target Database: ${options.database}`);
    console.log(` Output Archive:  ${dumpFilePath}`);
    console.log(` Backup ID:       ${backupId}`);
  }

  // 1. Connect to source database and verify it exists and is local
  const client = new Client({
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port || '5432', 10),
    user: parsedUrl.username,
    password: decodeURIComponent(parsedUrl.password),
    database: options.database,
  });

  await client.connect();
  const checkRes = await client.query<{ current_database: string }>('SELECT current_database();');
  const liveDbName = checkRes.rows[0]?.current_database;
  if (liveDbName !== options.database) {
    await client.end();
    throw new Error(`Connected database "${liveDbName}" does not match requested target "${options.database}".`);
  }

  const metadata = await collectDatabaseMetadata(client);
  await client.end();

  if (!options.jsonOutput) {
    console.log(` Public Tables:   ${metadata.tableCount}`);
    console.log(` Migration:       ${metadata.migrationVersion}`);
    console.log('\n[1/4] Executing pg_dump custom archive export...');
  }

  // 2. Execute pg_dump with custom format (-Fc) using safe argument array
  const host = parsedUrl.hostname;
  const port = parsedUrl.port || '5432';
  const username = parsedUrl.username;
  const password = decodeURIComponent(parsedUrl.password);

  execFileSync(
    'pg_dump',
    ['-h', host, '-p', port, '-U', username, '-Fc', '-f', dumpFilePath, options.database],
    {
      env: { ...process.env, PGPASSWORD: password },
      stdio: 'pipe',
    },
  );

  const archiveSizeBytes = statSync(dumpFilePath).size;
  const archiveSha256 = calculateSha256(dumpFilePath);

  if (!options.jsonOutput) {
    console.log(`      Created: ${dumpFilename} (${archiveSizeBytes.toLocaleString()} bytes)`);
    console.log(`      SHA-256: ${archiveSha256}`);
    console.log('\n[2/4] Verifying archive integrity and Table of Contents...');
  }

  // 3. Verify Table of Contents via pg_restore --list
  const tocResult = verifyDumpTOC(dumpFilePath);
  if (!tocResult.valid) {
    throw new Error(`pg_restore TOC validation failed for generated archive: ${tocResult.error}`);
  }

  if (!options.jsonOutput) {
    console.log(`      [PASS] TOC parsed successfully with ${tocResult.entryCount} catalog entries.`);
  }

  // 4. File storage packaging (optional)
  let storageFilename: string | undefined;
  let storageSizeBytes: number | undefined;
  let storageSha256: string | undefined;
  let storageFileCount: number | undefined;
  let storageSourcePath: string | undefined;
  let storageFileManifest: StorageFileEntry[] | undefined;

  if (options.includeStorage) {
    const { dir: storageSourceDir, isConfigured } = resolveEffectiveStorageDir(options.storageDir);
    storageSourcePath = storageSourceDir;

    // Fail visibly if expected configured production storage is missing
    if (isConfigured && !existsSync(storageSourceDir)) {
      throw new Error(
        `[SAFETY FATAL] Configured storage root directory "${storageSourceDir}" does not exist. Aborting backup to prevent incomplete production backup.`,
      );
    }

    if (existsSync(storageSourceDir)) {
      if (!options.jsonOutput) {
        console.log(`\n[3/4] Packaging active file storage assets from "${storageSourceDir}"...`);
      }
      storageFilename = `${baseName}.storage.tar.gz`;
      const storageFilePath = join(options.outputDir, storageFilename);

      try {
        storageFileManifest = collectStorageManifest(storageSourceDir);
        storageFileCount = storageFileManifest.length;
        execFileSync('tar', ['-czf', storageFilePath, '-C', storageSourceDir, '.'], { stdio: 'pipe' });
        if (existsSync(storageFilePath)) {
          storageSizeBytes = statSync(storageFilePath).size;
          storageSha256 = calculateSha256(storageFilePath);

          // Verify created archive integrity
          const archiveCheck = verifyStorageArchive(storageFilePath);
          if (!archiveCheck.valid) {
            throw new Error(`Generated storage archive failed verification: ${archiveCheck.error}`);
          }

          if (!options.jsonOutput) {
            console.log(
              `      Created: ${storageFilename} (${storageSizeBytes.toLocaleString()} bytes, ${storageFileCount} files cataloged in manifest)`,
            );
            console.log(`      SHA-256: ${storageSha256}`);
            console.log(`      [PASS] Storage archive Table of Contents verified (${archiveCheck.entryCount} catalog entries).`);
          }
        }
      } catch (err: unknown) {
        if (isConfigured || process.env.NODE_ENV === 'production') {
          throw new Error(
            `[FATAL] Storage asset packaging failed in production mode: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn(`[WARN] File storage packaging skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      if (!options.jsonOutput) {
        console.log(`\n[3/4] File storage directory "${storageSourceDir}" does not exist (development mode). Storage package omitted.`);
      }
    }
  }

  // 5. Build and write manifest
  const toolVersions = getToolVersions();
  const manifest: BackupManifest = {
    backupId,
    timestamp,
    sourceDatabase: options.database,
    format: 'pg_dump_custom',
    archiveFilename: dumpFilename,
    archiveSizeBytes,
    archiveSha256,
    storageFilename,
    storageSizeBytes,
    storageSha256,
    storageFileCount,
    storageSourcePath,
    storageFileManifest,
    migrationVersion: metadata.migrationVersion,
    tableCount: metadata.tableCount,
    tables: metadata.tables,
    recordCounts: metadata.recordCounts,
    toolVersions,
    verificationStatus: 'VERIFIED',
    verifiedAt: new Date().toISOString(),
  };

  writeFileSync(manifestFilePath, JSON.stringify(manifest, null, 2), 'utf-8');

  // 6. Retention enforcement
  if (!options.jsonOutput) {
    console.log('\n[4/4] Enforcing retention policy...');
  }
  const pruned = enforceRetention(options.outputDir, options.keepCount);
  if (!options.jsonOutput) {
    if (pruned.length > 0) {
      console.log(`      Pruned ${pruned.length} expired file(s): ${pruned.join(', ')}`);
    } else {
      console.log(`      Retention clean. Retaining up to ${options.keepCount} backups.`);
    }
    console.log('================================================================');
    console.log(' BACKUP COMPLETED & VERIFIED SUCCESSFULLY');
    console.log(` Manifest: ${manifestFilePath}`);
    console.log('================================================================');
  } else {
    console.log(JSON.stringify(manifest, null, 2));
  }

  return manifest;
}

export function runVerifyOnly(filePath: string): boolean {
  console.log('================================================================');
  console.log(' CSI GCET SB — Backup Archive Verification');
  console.log('================================================================');
  console.log(` Target File: ${filePath}`);

  if (!existsSync(filePath)) {
    console.error(`[FATAL] File not found: ${filePath}`);
    return false;
  }

  const manifestPath = filePath.endsWith('.dump')
    ? filePath.replace(/\.dump$/, '.json')
    : filePath.endsWith('.json')
      ? filePath
      : `${filePath}.json`;
  const dumpPath = filePath.endsWith('.json') ? filePath.replace(/\.json$/, '.dump') : filePath;

  if (!existsSync(dumpPath)) {
    console.error(`[FATAL] Dump archive not found: ${dumpPath}`);
    return false;
  }

  const computedHash = calculateSha256(dumpPath);
  console.log(` Computed SHA-256: ${computedHash}`);

  if (existsSync(manifestPath)) {
    const manifest: BackupManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    console.log(` Manifest SHA-256: ${manifest.archiveSha256}`);
    if (computedHash !== manifest.archiveSha256) {
      console.error('[FAILED] Checksum mismatch against manifest!');
      return false;
    }
    console.log(' [PASS] Checksum matched manifest.');

    if (manifest.storageFilename) {
      const storagePath = join(dirname(dumpPath), manifest.storageFilename);
      console.log(`\n Storage Archive: ${manifest.storageFilename}`);
      if (!existsSync(storagePath)) {
        console.error(` [FAILED] Companion storage archive not found: ${storagePath}`);
        return false;
      }
      const actualStorageSha256 = calculateSha256(storagePath);
      console.log(` Computed Storage SHA-256: ${actualStorageSha256}`);
      if (manifest.storageSha256 && actualStorageSha256.toLowerCase() !== manifest.storageSha256.toLowerCase()) {
        console.error(` [FAILED] Storage archive checksum mismatch! Expected ${manifest.storageSha256}, got ${actualStorageSha256}`);
        return false;
      }
      const storageCheck = verifyStorageArchive(storagePath);
      if (!storageCheck.valid) {
        console.error(` [FAILED] Storage archive TOC inspection failed: ${storageCheck.error}`);
        return false;
      }
      console.log(` [PASS] Storage archive Table of Contents valid (${storageCheck.entryCount} entries).`);
    }
  } else {
    console.warn(' [WARN] Companion manifest not found. Verifying archive TOC only...');
  }

  const toc = verifyDumpTOC(dumpPath);
  if (!toc.valid) {
    console.error(`[FAILED] pg_restore TOC inspection failed: ${toc.error}`);
    return false;
  }

  console.log(` [PASS] Archive Table of Contents valid (${toc.entryCount} catalog entries).`);
  console.log('================================================================');
  console.log(' VERIFICATION RESULT: VALID & UNCORRUPTED');
  console.log('================================================================');
  return true;
}

// Direct CLI entry point
if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  if (options.verifyOnlyFile) {
    const ok = runVerifyOnly(options.verifyOnlyFile);
    process.exit(ok ? 0 : 1);
  } else {
    runBackup(options)
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('\n[FATAL] Backup failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      });
  }
}
