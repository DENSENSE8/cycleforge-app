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
    // Integration driver: writes src/ probe files and shells the real jscpd
    // gate. `npm run verify` already runs `jscpd-gate.mjs` after unit tests;
    // keeping this file in the unit pass races leftover probes into that
    // later scan (ENOENT on deleted probes). Run it directly when changing
    // the gate: node --import tsx --test src/lib/governance/jscpd-gate.test.ts
    if (rel === 'src/lib/governance/jscpd-gate.test.ts') return false;
    if (!rel.endsWith('.guard.test.ts')) return true;
    return KEEPER_GUARDS.has(rel);
  })
  .sort();

if (files.length < 50) {
  console.error(`run-unit-tests: suspiciously few files (${files.length})`);
  process.exit(2);
}

// The burn is a CEILING, not a filter. Silently skipping a non-keeper guard
// let the population regrow 4 -> 17 in eight days: every one of those files
// was unrun, so it enforced nothing, while still costing every agent that
// read it a search for the rule it appeared to pin. A guard that does not run
// is prose wearing a test's filename. Add one here only by adding it to
// KEEPER_GUARDS — deliberately, with a reason — or put the invariant in the
// layer that can actually hold it (dep-cruiser, ESLint AST, TS props, a
// mounted DOM test) per AGENTS.md -> Guard authoring.
const strayGuards = walk(SRC)
  .map((abs) => relative(ROOT, abs).split('\\').join('/'))
  .filter((rel) => rel.endsWith('.guard.test.ts') && !KEEPER_GUARDS.has(rel));
if (strayGuards.length) {
  console.error(
    `run-unit-tests: ${strayGuards.length} guard test(s) exist outside KEEPER_GUARDS ` +
      `and would never run:\n  ${strayGuards.join('\n  ')}\n` +
      `Delete them, or promote to KEEPER_GUARDS in this file.`,
  );
  process.exit(2);
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
