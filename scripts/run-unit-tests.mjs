#!/usr/bin/env node
// Unit-test runner for verify/CI (governance reset 2026-08-12).
// Runs every src test file ending in .test.ts, but skips legacy
// "*.guard.test.ts" except the four structural keepers. Editor buffers may
// restore purged guards onto disk; those must not re-enter the gate.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const KEEPER_GUARDS = new Set([
  'src/lib/sot-manifest/sot-manifest.guard.test.ts',
  'src/design-system/foundations/motion-boundary.guard.test.ts',
  'src/lib/governance/frame-budget.guard.test.ts',
  'src/lib/governance/region-hosts.guard.test.ts',
]);

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
    return KEEPER_GUARDS.has(rel);
  })
  .sort();

if (files.length < 50) {
  console.error(`run-unit-tests: suspiciously few files (${files.length})`);
  process.exit(2);
}

const skippedGuards = walk(SRC)
  .map((abs) => relative(ROOT, abs).split('\\').join('/'))
  .filter((rel) => rel.endsWith('.guard.test.ts') && !KEEPER_GUARDS.has(rel));
if (skippedGuards.length) {
  console.log(
    `run-unit-tests: skipping ${skippedGuards.length} legacy guard tests (governance reset)`,
  );
}

const res = spawnSync(
  process.execPath,
  [
    '--test',
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
