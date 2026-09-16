#!/usr/bin/env tsx
/**
 * boundary-guard — the ratchet over `.dependency-cruiser.cjs`.
 *
 * House pattern (scripts/tenancy-guard.ts): the LAW lives in the depcruise
 * config; the RATCHET lives here. Every violation is diffed against the
 * frozen baseline in ./boundary-exemptions (shrink-only):
 *
 *   - NEW (unexempted) violations → reported; fail under --enforce (wired
 *     into verify as the Boundary gate, C2).
 *   - STALE exemptions (crossing fixed, entry still listed) → reported, so
 *     the baseline actually shrinks instead of rotting.
 *
 * This script is the SHARED RULE MODULE the design-mcp server plugs into
 * (its header's condition for an adjudicator, met 2026-09-14): verify runs it
 * full-tree; ds_boundary runs it scoped to one file.
 *
 * Usage:
 *   pnpm exec tsx scripts/boundary-guard.ts                    # full report
 *   pnpm exec tsx scripts/boundary-guard.ts --enforce          # verify gate
 *   pnpm exec tsx scripts/boundary-guard.ts --file <path>      # one file (ds_boundary)
 *   pnpm exec tsx scripts/boundary-guard.ts --file <path> --json
 *   pnpm exec tsx scripts/boundary-guard.ts --write-baseline   # first seed ONLY
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { BOUNDARY_EXEMPTIONS } from './boundary-exemptions';

const BOUNDARY_RULES = new Set([
  'mobile-no-desktop-surface-components',
  'desktop-no-mobile-components',
]);

interface DepcruiseModule {
  source: string;
  dependencies: { resolved: string; rules?: { name?: string }[] | string[] }[];
}

function ruleNames(rules: { name?: string }[] | string[] | undefined): string[] {
  return (rules ?? []).map((r) => (typeof r === 'string' ? r : (r.name ?? '')));
}

function runDepcruise(targets: string[], stopTraversal: boolean): string[] {
  const args = [
    ...targets,
    '--config',
    '.dependency-cruiser.cjs',
    '--output-type',
    'json',
  ];
  if (stopTraversal) {
    // Scoped adjudication: cruise THIS file, record its direct dependencies
    // (violations evaluate on the from-side edges), follow nothing further.
    args.push('--do-not-follow', '.');
  }
  const run = spawnSync('node_modules/.bin/depcruise', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error || (run.status !== 0 && !run.stdout)) {
    console.error('depcruise failed:', run.error ?? run.stderr);
    process.exit(2);
  }
  const report = JSON.parse(run.stdout) as { modules: DepcruiseModule[] };
  const pairs = new Set<string>();
  for (const mod of report.modules) {
    for (const dep of mod.dependencies) {
      const hit = ruleNames(dep.rules).some((name) => BOUNDARY_RULES.has(name));
      if (hit) pairs.add(`${mod.source} => ${dep.resolved}`);
    }
  }
  return [...pairs].sort();
}

const fileFlag = process.argv.find((a) => a.startsWith('--file='));
const fileIdx = process.argv.indexOf('--file');
const filePath = fileFlag
  ? fileFlag.slice('--file='.length)
  : fileIdx >= 0 && process.argv[fileIdx + 1]
    ? process.argv[fileIdx + 1]
    : undefined;
const wantsJson = process.argv.includes('--json');
const enforce = process.argv.includes('--enforce');

if (filePath) {
  // ── Scoped mode (ds_boundary): adjudicate one file against the law. ──────
  const pairs = runDepcruise([filePath], true);
  const baseline = new Set(BOUNDARY_EXEMPTIONS);
  const crossings = pairs.map((p) => {
    const to = p.split(' => ')[1] ?? p;
    return { to, status: baseline.has(p) ? 'baseline' : 'new' };
  });
  const verdict = crossings.some((c) => c.status === 'new') ? 'fail' : 'pass';
  if (wantsJson) {
    console.log(JSON.stringify({ file: filePath, verdict, crossings }, null, 2));
  } else {
    console.log(`boundary-guard (${filePath}): ${verdict}`);
    for (const c of crossings) console.log(`  ${c.status === 'new' ? '+' : '='} ${c.to}`);
    if (!crossings.length) console.log('  no boundary crossings');
  }
  if (verdict === 'fail') process.exit(1);
  process.exit(0);
}

// ── Full-tree mode (verify gate / report). ──────────────────────────────────
const violations = runDepcruise(['src'], false);
const baseline = new Set(BOUNDARY_EXEMPTIONS);
const newViolations = violations.filter((p) => !baseline.has(p));
const staleExemptions = BOUNDARY_EXEMPTIONS.filter((p) => !violations.includes(p));

console.log(`boundary-guard: ${violations.length} crossings (baseline ${BOUNDARY_EXEMPTIONS.length})`);
if (newViolations.length) {
  console.log(`\nNEW violations (${newViolations.length}) — fix or get an explicit ruling:`);
  for (const p of newViolations) console.log(`  + ${p}`);
}
if (staleExemptions.length) {
  console.log(`\nSTALE exemptions (${staleExemptions.length}) — shrink the baseline:`);
  for (const p of staleExemptions) console.log(`  - ${p}`);
}
if (!newViolations.length && !staleExemptions.length) {
  console.log('ratchet clean: no new crossings, no stale exemptions.');
}

if (process.argv.includes('--write-baseline')) {
  const body = violations.map((p) => `  ${JSON.stringify(p)},`).join('\n');
  writeFileSync(
    'scripts/boundary-exemptions.ts',
    `/** FROZEN BASELINE — 2026-09-14 audit (C1). SHRINK-ONLY. */\nexport const BOUNDARY_EXEMPTIONS: readonly string[] = [\n${body}\n];\n`,
  );
  console.log(`\nbaseline written: ${violations.length} entries.`);
}

if (enforce && (newViolations.length || staleExemptions.length)) {
  process.exit(1);
}
