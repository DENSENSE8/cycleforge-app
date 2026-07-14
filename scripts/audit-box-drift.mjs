#!/usr/bin/env node
/**
 * Box-drift audit — REPORT ONLY, not a ratchet (spacing-token-leakage plan
 * Phase 4.2). Finds hand-rolled "box shells" — a rounded-* + border/ring +
 * surface-bg combo on one line — outside src/design-system. Those lines
 * should compose <Panel> / <SectionCard> / <CardShell> instead of re-rolling
 * the shell (Kinetic Ledger: compose named shells; grow the SoT when wrong).
 *
 * Usage: node scripts/audit-box-drift.mjs
 * Always exits 0. Promote to a guard test once the count trends down.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(process.cwd(), 'src');
const DESIGN_SYSTEM = join(SRC, 'design-system');

const ROUNDED_RE = /rounded-(?:md|lg|xl|2xl|3xl)\b/;
const EDGE_RE = /(?:\bborder\b|\bborder-(?!spacing)|ring-1|ring-2)/;
const SURFACE_RE = /bg-(?:surface-(?:card|canvas|sunken)|white\b|gray-50\b)/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (full === DESIGN_SYSTEM) continue; // the DS may define shells
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const perFile = new Map();
let total = 0;
for (const file of walk(SRC)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let count = 0;
  for (const line of lines) {
    const t = line.trimStart();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    if (ROUNDED_RE.test(line) && EDGE_RE.test(line) && SURFACE_RE.test(line)) count += 1;
  }
  if (count > 0) {
    perFile.set(relative(SRC, file).split(sep).join('/'), count);
    total += count;
  }
}

const perFolder = new Map();
for (const [rel, count] of perFile) {
  const folder = rel.split('/').slice(0, 2).join('/');
  perFolder.set(folder, (perFolder.get(folder) ?? 0) + count);
}

const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);

console.log(`Hand-rolled box shells outside src/design-system: ${total} lines in ${perFile.size} files\n`);
console.log('By folder:');
for (const [folder, count] of sortDesc(perFolder)) console.log(`  ${String(count).padStart(4)}  ${folder}`);
console.log('\nTop files:');
for (const [rel, count] of sortDesc(perFile).slice(0, 15)) console.log(`  ${String(count).padStart(4)}  ${rel}`);
console.log('\nFix: compose <Panel> (generic surface), monitor <SectionCard> (rollup zones),');
console.log('or <CardShell> (selectable rows) — never re-roll rounded+border+bg by hand.');
