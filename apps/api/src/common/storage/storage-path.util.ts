import { resolve, join, normalize, relative, isAbsolute } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { BadRequestException } from '@nestjs/common';
import { env } from '../../config/env.js';

/**
 * Resolves and ensures existence of canonical root storage directories (AUD-ARCH-01, AUD-ARCH-03).
 * Prioritizes STORAGE_ROOT_DIR when configured; otherwise falls back cleanly based on workspace context.
 */
export function resolveStorageDirectory(subDirectory: string): string {
  let baseRoot: string;

  if (env.STORAGE_ROOT_DIR) {
    baseRoot = resolve(env.STORAGE_ROOT_DIR);
  } else {
    const cwd = process.cwd();
    if (existsSync(resolve(cwd, 'apps/api'))) {
      baseRoot = resolve(cwd, 'apps/api/storage');
    } else {
      baseRoot = resolve(cwd, 'storage');
    }
  }

  const resolved = normalize(join(baseRoot, subDirectory));
  if (!existsSync(resolved)) {
    mkdirSync(resolved, { recursive: true });
  }

  return resolved;
}

/**
 * Validates path containment to strictly prevent directory traversal attacks (e.g. `../../etc/passwd`)
 * and sibling-directory prefix bypasses (e.g. `/var/storage_fake` vs `/var/storage`).
 */
export function isPathContained(targetPath: string, rootDir: string): boolean {
  const resolvedRoot = normalize(resolve(rootDir));
  const resolvedTarget = normalize(resolve(targetPath));

  const rel = relative(resolvedRoot, resolvedTarget);

  // If rel starts with '..' or is absolute (e.g. different drive letters on Windows),
  // targetPath escapes rootDir.
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return false;
  }

  return true;
}

/**
 * Asserts path containment, returning the normalized absolute path or throwing BadRequestException.
 */
export function assertPathContained(
  targetPath: string,
  rootDir: string,
  errorMessage: string = 'Path traversal attempt detected.',
): string {
  if (!isPathContained(targetPath, rootDir)) {
    throw new BadRequestException(errorMessage);
  }
  return normalize(resolve(targetPath));
}
