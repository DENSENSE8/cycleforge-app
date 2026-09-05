#!/usr/bin/env node
/**
 * Visual + axe walk — plan §7.4 steps 1–2, 5–6.
 *
 * Runs on the runner's full profile when CYCLEFORGE_CI=1 (or CI_VISUAL=1).
 * Laptop `verify` / pre-push skip: a 5-minute Playwright walk does not belong
 * on the commit path, and capture is against `next start` on a built worktree
 * (plan §7.4 seed finding), not `next dev`.
 *
 * Skip (exit 0) when:
 *   - the operator has not committed baselines (nothing to compare);
 *   - no reachable PW_BASE_URL (the runner does not start Next yet).
 * A skip is a receipt warning, not a green visual.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOTS = path.join(ROOT, 'tests/e2e/visual-peers.spec.ts-snapshots');
const BASE = process.env.PW_BASE_URL || 'http://localhost:3050';

function skip(reason) {
  process.stdout.write(JSON.stringify({ gate: 'visual-peers', skipped: true, reason }, null, 2) + '\n');
  process.exit(0);
}

if (!process.env.CYCLEFORGE_CI && process.env.CI_VISUAL !== '1') {
  skip('not the CI runner — set CI_VISUAL=1 to force the walk');
}

if (!existsSync(SNAPSHOTS)) {
  skip('no operator-approved baselines (tests/e2e/visual-peers.spec.ts-snapshots/)');
}

function reachable(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 2500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

if (!(await reachable(BASE))) {
  skip(`PW_BASE_URL not reachable (${BASE}) — capture needs next start on a built worktree`);
}

const bin = path.join(ROOT, 'node_modules', '.bin', 'playwright');
const res = spawnSync(
  bin,
  ['test', 'tests/e2e/visual-peers.spec.ts', '--project=desktop'],
  { cwd: ROOT, stdio: 'inherit', env: process.env },
);
process.exit(res.status === 0 ? 0 : res.status ?? 1);
