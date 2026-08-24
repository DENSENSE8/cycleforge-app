#!/usr/bin/env node
/**
 * Launch the Cycle Forge desktop shell against the ALREADY-RUNNING dev server.
 *
 * HARD LAW (AGENTS.md): the user owns the dev server.
 * This script ATTACHES to it and never starts, restarts, or kills one — the
 * legacy shell's dev harness spawned `npm run dev` itself, which is exactly the
 * behaviour that rule forbids. If nothing is listening we say so and exit; we
 * do not "helpfully" boot a second server that would fight for the port.
 *
 * Warehouse OS worktree (this branch) serves on :3051; main dogfood is :3050.
 * With no ELECTRON_START_URL we probe 3051 first, then 3050.
 *
 *   pnpm dev            # you, in your own terminal (:3050 or :3051)
 *   pnpm desktop:dev    # this script, in another
 *
 * Override the target with ELECTRON_START_URL to attach to a deployed
 * environment instead (e.g. a Vercel preview).
 */

import { spawn } from 'node:child_process';

const EXPLICIT = (process.env.ELECTRON_START_URL || '').replace(/\/+$/, '');
const CANDIDATES = EXPLICIT
  ? [EXPLICIT]
  : ['http://127.0.0.1:3051', 'http://127.0.0.1:3050'];

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

let TARGET = '';
for (const url of CANDIDATES) {
  if (await isUp(url)) {
    TARGET = url;
    break;
  }
}

if (!TARGET) {
  console.error(
    [
      '',
      `  Nothing is answering at ${CANDIDATES.join(' or ')}.`,
      '',
      '  This script attaches to your dev server — it will not start one.',
      '  Start it yourself in another terminal:',
      '',
      '      pnpm dev            # :3050 (main)',
      '      next dev --turbopack -p 3051   # Warehouse OS worktree',
      '',
      '  …then re-run `pnpm desktop:dev`.',
      '  (Attaching somewhere else? Set ELECTRON_START_URL.)',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`[desktop] attaching to ${TARGET}`);

const electron = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['electron', '.'],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ELECTRON_START_URL: TARGET, NODE_ENV: 'development' },
  },
);

// Only ever signal the child we started. The dev server is not ours to touch.
const stop = () => {
  if (!electron.killed) electron.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

electron.on('exit', (code) => process.exit(code ?? 0));
