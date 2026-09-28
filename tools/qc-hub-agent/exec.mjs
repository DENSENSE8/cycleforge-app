/** Optional-tool detection and bounded subprocess calls. */

import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import path from 'node:path';

const toolCache = new Map();

/** True when `name` is an executable on PATH (cached per process). */
export async function hasTool(name) {
  if (toolCache.has(name)) return toolCache.get(name);
  let found = false;
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    try {
      await access(path.join(dir, name), constants.X_OK);
      found = true;
      break;
    } catch {
      /* not in this dir */
    }
  }
  toolCache.set(name, found);
  return found;
}

/**
 * Run a tool; resolves stdout, or null on spawn failure / timeout / non-zero exit.
 * `acceptExit` lets tools that encode warnings in the exit status (smartctl's
 * bitmask) still hand back their output.
 */
export function run(cmd, args, { timeoutMs = 8000, acceptExit = () => false } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (!error) return resolve(stdout);
      if (typeof error.code === 'number' && acceptExit(error.code) && stdout) return resolve(stdout);
      resolve(null);
    });
  });
}
