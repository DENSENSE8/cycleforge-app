#!/usr/bin/env node
/**
 * `pnpm dev` launcher — starts `next dev --turbopack` on THIS worktree's port.
 *
 * The port is resolved from `dev-worktrees.json` via `resolveWorktreePort()`, so
 * running `pnpm dev` in `cycleforge-fba` boots :3020 while `cycleforge-app` boots
 * :3000 — no `-p` flag, no PORT export, no collisions. Two lanes = two agents =
 * two dev servers, in parallel, by default.
 *
 * Extra args pass straight through: `pnpm dev --experimental-https` etc.
 * Set DEV_PORT/PORT to override the resolved port. Use `pnpm dev:next` for the
 * raw `next dev --turbopack` with no resolution.
 *
 * Port is passed BOTH as `-p <port>` (what next reads) and PORT env (belt +
 * suspenders — some tooling reads the env). Mirrors dev-tunnel-named.mjs.
 */

import { spawn } from 'node:child_process';
import { resolveWorktreePort } from './dev-worktree-port.mjs';

const { port, id, source } = resolveWorktreePort();
const extra = process.argv.slice(2);

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
console.log(
  `${DIM}[dev]${RESET} lane ${CYAN}${id ?? 'main'}${RESET} → ${CYAN}http://localhost:${port}${RESET} ${DIM}(port ${source})${RESET}`,
);

const child = spawn('next', ['dev', '--turbopack', '-p', String(port), ...extra], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, PORT: String(port), DEV_PORT: String(port) },
});

const forward = (sig) => {
  try {
    child.kill(sig);
  } catch {
    /* already gone */
  }
};
process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
child.on('error', (err) => {
  console.error(`[dev] failed to start next: ${err.message}`);
  process.exit(1);
});
