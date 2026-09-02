#!/usr/bin/env node
// Unit-test runner for verify/CI.
//
// Runs every src `*.test.ts` except `*.guard.test.ts` (structural guard fleet
// deleted 2026-08-19; leftovers purged 2026-09-01 — do not re-add) and the
// jscpd integration driver (verify already runs `jscpd-gate.mjs`).
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const files = walk(SRC)
  .map((abs) => relative(ROOT, abs).split('\\').join('/'))
  .filter((rel) => {
    if (rel.endsWith('.guard.test.ts')) return false;
    // Integration driver: writes src/ probe files and shells the real jscpd
    // gate. `npm run verify` already runs `jscpd-gate.mjs` after unit tests.
    if (rel === 'src/lib/governance/jscpd-gate.test.ts') return false;
    return true;
  })
  .sort();

if (files.length < 50) {
  console.error(`run-unit-tests: suspiciously few files (${files.length})`);
  process.exit(2);
}

/**
 * Cap how many test files run at once.
 *
 * `node --test` defaults to `availableParallelism()` workers, and every worker
 * here is a full `tsx` TypeScript compile — not a cheap fork. Across 755 test
 * files on a 16-core box that pins all 16 cores for the length of the run and
 * starves everything else sharing the machine (dev servers, other agents).
 *
 * Half the cores keeps the box usable and costs little wall-clock: the run is
 * compile-bound, so the extra workers were mostly competing for the same cores
 * rather than adding throughput. Override with TEST_CONCURRENCY=N for CI or a
 * deliberate full-speed run; TEST_CONCURRENCY=0 restores the Node default.
 */
function testConcurrency() {
  const raw = process.env.TEST_CONCURRENCY;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      console.error(`run-unit-tests: TEST_CONCURRENCY must be a non-negative integer, got "${raw}"`);
      process.exit(2);
    }
    return n;
  }
  return Math.max(1, Math.floor(availableParallelism() / 2));
}

const concurrency = testConcurrency();
console.log(
  `run-unit-tests: ${files.length} file(s), concurrency ${concurrency || `default (${availableParallelism()})`}`,
);

const res = spawnSync(
  process.execPath,
  [
    '--test',
    ...(concurrency ? [`--test-concurrency=${concurrency}`] : []),
    '--require',
    './scripts/register-server-only-shim.cjs',
    '--import',
    'tsx',
    '--test-reporter',
    'spec',
    ...files,
  ],
  { stdio: 'inherit', cwd: ROOT, env: process.env },
);
process.exit(res.status ?? 1);
