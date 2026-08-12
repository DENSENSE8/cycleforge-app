#!/usr/bin/env node
/**
 * The debt ledger — print what the ratchets are currently forgiving.
 *
 * This repo enforces cleanliness with shrink-only baselines: `knip-baseline.json`
 * parks known dead code, and each DS guard parks a count of legacy call sites in
 * a `const *_BASELINE = N`. That design is right — it stops NEW debt without
 * blocking every unrelated change on a full migration.
 *
 * But a shrink-only ratchet never *forces* cleanup, it only forbids growth. So a
 * number that nobody ever reads quietly legitimises whatever it is holding. That
 * is the mechanism by which 10,540 LOC sat orphaned across 82 files while every
 * gate stayed green: `npm run verify` printed "PASS", and PASS was true.
 *
 * So: print the numbers where they are seen. `npm run debt` shows the ledger,
 * and `npm run verify` echoes the totals on success — a ledger nobody is charged
 * for is a ledger nobody pays.
 *
 * These are BASELINES (the parked allowance), not live counts. That is the
 * honest figure for a ratchet: because baselines only shrink, the baseline IS
 * the debt the codebase has agreed to carry. A guard prints its actual count
 * only when it fails.
 *
 * Usage:
 *   node scripts/debt-ledger.mjs            # full ledger
 *   node scripts/debt-ledger.mjs --summary  # one line (used by verify)
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUMMARY = process.argv.includes('--summary');

/** `const RAW_FOCUS_BASELINE = 1075;` — the house ratchet shape. */
const BASELINE_RE = /^const\s+([A-Z0-9_]*(?:BASELINE|BUDGET|CAP)[A-Z0-9_]*)\s*(?::\s*number)?\s*=\s*(\d+);/gm;

/**
 * Walk `src/` directly rather than asking git.
 *
 * This started as `git ls-files` and silently returned `[]` wherever git could
 * not answer (a `git archive` export, a CI cache, a tarball) — so the ledger
 * printed "DS ratchets 0" and read as a codebase with no debt at all. A ledger
 * that reports zero when it cannot read is worse than no ledger: it is the
 * false-clean signal this whole script exists to remove. The filesystem is the
 * thing being measured, so measure it.
 */
function testFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) testFiles(full, out);
    else if (entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

function ratchets() {
  const src = join(REPO_ROOT, 'src');
  if (!existsSync(src)) {
    console.error('debt-ledger: no src/ directory — cannot measure. Refusing to report 0.');
    process.exit(2);
  }

  const out = [];
  for (const full of testFiles(src)) {
    const text = readFileSync(full, 'utf8');
    const rel = full.slice(REPO_ROOT.length + 1);
    for (const m of text.matchAll(BASELINE_RE)) {
      const value = Number(m[2]);
      // A baseline already at 0 is a CLOSED door, not debt — it forbids the
      // pattern outright. Listing it as debt would misreport a finished job.
      if (value === 0) continue;
      out.push({ name: m[1], value, file: rel.replace(/^src\//, '') });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}

function knipCount() {
  const p = join(REPO_ROOT, 'knip-baseline.json');
  if (!existsSync(p)) return null;
  try {
    const b = JSON.parse(readFileSync(p, 'utf8'));
    return typeof b.count === 'number' ? b.count : (b.findings?.length ?? null);
  } catch {
    return null;
  }
}

const rows = ratchets();
const ratchetTotal = rows.reduce((a, r) => a + r.value, 0);
const knip = knipCount();

if (SUMMARY) {
  const parts = [];
  if (knip !== null) parts.push(`knip ${knip}`);
  parts.push(`DS ratchets ${ratchetTotal} across ${rows.length}`);
  console.log(`   debt ledger: ${parts.join(' · ')}   (npm run debt)`);
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

console.log('');
console.log('  Debt ledger — what the shrink-only ratchets are forgiving');
console.log('  ' + '─'.repeat(66));

if (knip !== null) {
  console.log(`  ${pad('knip-baseline.json (parked dead-code findings)', 52)}${lpad(knip, 8)}`);
  console.log('');
}

console.log(`  ${pad('DS / domain ratchets', 52)}${lpad('', 8)}`);
for (const r of rows) {
  console.log(`    ${pad(r.name, 44)}${lpad(r.value, 8)}   ${r.file}`);
}
console.log('  ' + '─'.repeat(66));
console.log(`  ${pad('ratchet subtotal', 52)}${lpad(ratchetTotal, 8)}`);
if (knip !== null) {
  console.log(`  ${pad('TOTAL parked findings', 52)}${lpad(knip + ratchetTotal, 8)}`);
}
console.log('');
console.log('  Baselines only ever shrink (AGENTS.md). Raising one to make a gate');
console.log('  pass is prohibited; migrate the call sites or add the documented');
console.log('  `ds-*` escape for a genuine one-off.');
if (rows.length) {
  const top = rows[0];
  console.log('');
  console.log(`  Largest single target: ${top.name} (${top.value}) — ${top.file}`);
}
console.log('');
