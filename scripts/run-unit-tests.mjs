#!/usr/bin/env node
// Unit-test runner for verify/CI.
//
// Runs every src test file ending in .test.ts, INCLUDING "*.guard.test.ts",
// except an explicit, shrink-only QUARANTINE of guards that are red today.
//
// The default was inverted 2026-08-19. The governance reset (2026-08-12) had
// allowlisted four structural keepers and skipped every other guard, which
// meant a guard written AFTER the reset was silently not enforced: the Preview
// stance shipped 12 passing guard tests and a 10-test E2E, and `npm run verify`
// ran neither. A gate you have to remember to opt into is not a gate.
//
// Adding a guard file is now enough to enforce it. A guard that is red goes in
// QUARANTINE with a reason and a fix owner — never silently skipped, and the
// list only shrinks.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/**
 * Guards that are RED against the current tree. Each records the drift it is
 * reporting, so the next agent fixes the code or the guard rather than deleting
 * one of them. SHRINK-ONLY: never add a line to make a change land.
 *
 * EMPTY as of 2026-08-19: every `*.guard.test.ts` in src/ was deleted at the
 * operator's explicit request (structural guards removed for iteration speed).
 * The five entries that lived here named files that no longer exist, and the
 * ghost check below would exit 2 on them. The machinery is intentionally kept —
 * adding a guard file back is still enough to enforce it.
 */
const QUARANTINE = new Map([]);

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
    if (!rel.endsWith('.guard.test.ts')) return true;
    return !QUARANTINE.has(rel);
  })
  .sort();

if (files.length < 50) {
  console.error(`run-unit-tests: suspiciously few files (${files.length})`);
  process.exit(2);
}

const onDisk = new Set(
  walk(SRC)
    .map((abs) => relative(ROOT, abs).split('\\').join('/'))
    .filter((rel) => rel.endsWith('.guard.test.ts')),
);
const quarantined = [...QUARANTINE.keys()].filter((rel) => onDisk.has(rel));
if (quarantined.length) {
  console.log(`run-unit-tests: ${quarantined.length} guard(s) QUARANTINED (red, shrink-only):`);
  for (const rel of quarantined) console.log(`  - ${rel} — ${QUARANTINE.get(rel)}`);
}
// A quarantine entry for a guard nobody deleted is one thing; an entry for a
// file that no longer exists is a stale excuse. Fail rather than carry it.
const ghosts = [...QUARANTINE.keys()].filter((rel) => !onDisk.has(rel));
if (ghosts.length) {
  console.error(`run-unit-tests: QUARANTINE names ${ghosts.length} file(s) that do not exist:`);
  for (const rel of ghosts) console.error(`  - ${rel}`);
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
