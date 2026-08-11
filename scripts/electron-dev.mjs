#!/usr/bin/env node
/**
 * Launch the Cycle Forge desktop shell against the ALREADY-RUNNING dev server.
 *
 * HARD LAW (.claude/rules/workflow-safety.md): the user owns the dev server.
 * This script ATTACHES to it and never starts, restarts, or kills one — the
 * legacy shell's dev harness spawned `npm run dev` itself, which is exactly the
 * behaviour that rule forbids. If :3050 is not up, we say so and exit; we do not
 * "helpfully" boot a second server that would fight for the port.
 *
 *   pnpm dev            # you, in your own terminal (port 3050)
 *   pnpm desktop:dev    # this script, in another
 *
 * Override the target with ELECTRON_START_URL to attach to a deployed
 * environment instead (e.g. a Vercel preview).
 */

import { spawn } from 'node:child_process';

const TARGET = (process.env.ELECTRON_START_URL || 'http://127.0.0.1:3050').replace(/\/+$/, '');

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

const up = await isUp(TARGET);
if (!up) {
  console.error(
    [
      '',
      `  Nothing is answering at ${TARGET}.`,
      '',
      '  This script attaches to your dev server — it will not start one.',
      '  Start it yourself in another terminal:',
      '',
      '      pnpm dev',
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
