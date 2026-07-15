#!/usr/bin/env node
/**
 * Resolve the dev-server port assigned to the *current* git worktree.
 *
 *   import { resolveWorktreePort } from './dev-worktree-port.mjs';
 *   const { port } = resolveWorktreePort();          // 3000 | 3010 | 3020 | …
 *
 *   node scripts/dev-worktree-port.mjs               # prints just the port
 *
 * Why this exists: each worktree lane runs its OWN `next dev` on its OWN port so
 * several agents (or a human + agents) can run parallel dev servers without
 * colliding on :3000. The port map is the single source of truth in
 * `dev-worktrees.json` (root `port`/`appPort` per tree). This resolver lets any
 * process inside any lane discover its own port with zero per-lane config.
 *
 * Matching is realpath-exact against the config's `trees[].path` (resolved from
 * the MAIN worktree root, found via `git rev-parse --git-common-dir`), so it
 * works identically from `cycleforge-app` and from any linked `cycleforge-<id>`
 * worktree — they all read the same tracked config but match their own dir.
 *
 * Precedence: explicit `DEV_PORT`/`PORT` env  →  config match  →  config
 * top-level `appPort` fallback  →  3000. Any git/config failure degrades to
 * that fallback chain and NEVER throws — a resolver must not break `pnpm dev`.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_APP_PORT = 3000;

function safeReal(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function git(cmd, cwd) {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * @param {{ cwd?: string }} [opts]
 * @returns {{ port: number, id: string | null, source: 'env' | 'config' | 'fallback' }}
 */
export function resolveWorktreePort(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const envRaw = process.env.DEV_PORT || process.env.PORT;
  const envPort = Number(envRaw);
  const hasEnvPort = Boolean(envRaw) && Number.isFinite(envPort) && envPort > 0;

  // Explicit env wins — lets an agent force a port regardless of config.
  if (hasEnvPort) return { port: envPort, id: null, source: 'env' };

  // Locate this worktree + the MAIN worktree root (which holds the tracked config).
  let toplevel;
  let mainRoot;
  try {
    toplevel = git('rev-parse --show-toplevel', cwd);
    const commonDir = git('rev-parse --git-common-dir', cwd);
    const absCommon = path.resolve(toplevel, commonDir);
    mainRoot = path.basename(absCommon) === '.git' ? path.dirname(absCommon) : toplevel;
  } catch {
    return { port: DEFAULT_APP_PORT, id: null, source: 'fallback' };
  }

  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(mainRoot, 'dev-worktrees.json'), 'utf8'));
  } catch {
    return { port: DEFAULT_APP_PORT, id: null, source: 'fallback' };
  }

  const trees = Array.isArray(cfg?.trees) ? cfg.trees : [];
  const realTop = safeReal(toplevel);
  for (const t of trees) {
    if (!t?.path) continue;
    const abs = path.isAbsolute(t.path) ? t.path : path.resolve(mainRoot, t.path);
    if (safeReal(abs) === realTop) {
      const port = Number(t.appPort) || Number(cfg.appPort) || DEFAULT_APP_PORT;
      return { port, id: t.id ?? null, source: 'config' };
    }
  }

  return { port: Number(cfg.appPort) || DEFAULT_APP_PORT, id: null, source: 'fallback' };
}

// CLI: print just the resolved port (for shell interpolation).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href || process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(String(resolveWorktreePort().port) + '\n');
}
