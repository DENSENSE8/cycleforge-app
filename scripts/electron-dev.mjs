#!/usr/bin/env node
/**
 * Launch the Cycle Forge desktop shell against the ALREADY-RUNNING main
 * dogfood server on :3050.
 *
 * This checkout is MAIN. The Claude / Warehouse OS worktree owns :3051 and
 * its own Electron. Never probe :3051 from here — that would load the
 * worktree origin into the dogfood desktop. The Cloudflare tunnel
 * (usav-dev) is browser-only and also fronts :3050; this shell stays on
 * loopback.
 *
 *   pnpm dev            # cycleforge-dev.service — :3050
 *   pnpm desktop:dev    # this script, attaches to :3050
 */

import { spawn } from 'node:child_process';

const PINNED = 'http://127.0.0.1:3050';

function isPinnedLocal(url) {
  try {
    const u = new URL(url);
    const host = u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]';
    return host && u.port === '3050' && u.protocol === 'http:';
  } catch {
    return false;
  }
}

const requested = (process.env.ELECTRON_START_URL || PINNED).replace(/\/+$/, '');
if (!isPinnedLocal(requested)) {
  console.error(
    [
      '',
      `  Refusing ELECTRON_START_URL=${requested}`,
      `  Main desktop is pinned to ${PINNED} (local dogfood).`,
      '  The worktree Electron owns :3051. The usav-dev tunnel is browser-only.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

/** Probe without failing the process — any HTTP answer means something is listening. */
async function isUp(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    await fetch(url, { signal: controller.signal, redirect: 'manual' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

if (!(await isUp(PINNED))) {
  console.error(
    [
      '',
      `  Nothing is answering at ${PINNED}.`,
      '',
      '  Main dogfood is cycleforge-dev.service on :3050 — this script will not start it.',
      '  Check: systemctl --user status cycleforge-dev.service',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`[desktop] attaching to ${PINNED} (main dogfood)`);

const electron = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['electron', '.'],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ELECTRON_START_URL: PINNED, NODE_ENV: 'development' },
  },
);

const stop = () => {
  if (!electron.killed) electron.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

electron.on('exit', (code) => process.exit(code ?? 0));
