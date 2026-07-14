#!/usr/bin/env node
/**
 * Codemod: rewrite the four unambiguous padding pairs onto their Tier-2
 * spacing intents (spacing-token-leakage plan Phase 5.1):
 *
 *   px-1.5 py-0.5  →  inset-chip
 *   px-3 py-2      →  inset-field
 *   px-2.5 py-1.5  →  inset-cozy
 *   px-4 py-6      →  inset-empty
 *
 * Conservative by construction:
 *   - only ADJACENT pairs (either order, single space), boundary-safe
 *     (rejects px-3.5 / py-2.5 / md:px-3 variants);
 *   - skips comment lines, `ds-allow-spacing` lines, lines already carrying
 *     an `inset-` intent, and *.test.ts(x) files;
 *   - skips git-dirty files by default (never collide with in-flight work;
 *     override with --include-dirty);
 *   - dry-run by default; prints per-file counts, sample rewrites, and WARN
 *     markers where the rewritten line still references a merged
 *     `className` or another padding utility — those need a human eye
 *     (an intent + a later raw p-* both survive cn(); the intent wins in
 *     CSS order, which can silently break an override).
 *
 * Usage:  node scripts/codemods/spacing-intents.mjs --dir=src/components/admin [--combo=field] [--apply]
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const DIR = join(ROOT, getArg('dir', 'src'));
const COMBO = getArg('combo', 'all');
const APPLY = args.includes('--apply');
const INCLUDE_DIRTY = args.includes('--include-dirty');

const COMBOS = {
  chip: { intent: 'inset-chip', a: 'px-1.5', b: 'py-0.5' },
  field: { intent: 'inset-field', a: 'px-3', b: 'py-2' },
  cozy: { intent: 'inset-cozy', a: 'px-2.5', b: 'py-1.5' },
  empty: { intent: 'inset-empty', a: 'px-4', b: 'py-6' },
};
const selected = COMBO === 'all' ? Object.values(COMBOS) : [COMBOS[COMBO]];
if (selected.some((c) => !c)) {
  console.error(`Unknown --combo=${COMBO} (chip|field|cozy|empty|all)`);
  process.exit(1);
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Boundary-safe adjacent pair: `(?<![\w:-])` rejects -px / md: variants and
// mid-token starts; `(?![\w.-])` rejects py-2.5 / py-20 tails.
const pairRe = (a, b) => new RegExp(`(?<![\\w:-])${esc(a)} ${esc(b)}(?![\\w.-])`, 'g');
const rules = selected.flatMap((c) => [
  { re: pairRe(c.a, c.b), intent: c.intent },
  { re: pairRe(c.b, c.a), intent: c.intent },
]);

const dirty = new Set(
  INCLUDE_DIRTY
    ? []
    : execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' })
        .split('\n')
        .map((l) => l.slice(3).trim())
        .filter(Boolean),
);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry)) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const isCommentLine = (line) => {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

let total = 0;
const perFile = [];
const samples = [];
const warns = [];
const skippedDirty = [];

for (const file of walk(DIR)) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (dirty.has(rel)) {
    skippedDirty.push(rel);
    continue;
  }
  const lines = readFileSync(file, 'utf8').split('\n');
  let fileCount = 0;
  const next = lines.map((line, i) => {
    // Skip lines already carrying a spacing INTENT (double intents on one
    // element resolve by stylesheet order, not string order). Positioning
    // `inset-0`/`inset-x-*` is a different axis and must NOT block rewrites.
    if (isCommentLine(line) || line.includes('ds-allow-spacing') || /inset-(chip|field|cozy|card|empty)/.test(line)) return line;
    let out = line;
    for (const { re, intent } of rules) {
      re.lastIndex = 0;
      if (re.test(out)) {
        re.lastIndex = 0;
        out = out.replace(re, intent);
      }
    }
    if (out !== line) {
      const n = 1;
      fileCount += n;
      total += n;
      if (samples.length < 40) samples.push(`  ${rel}:${i + 1}\n    - ${line.trim()}\n    + ${out.trim()}`);
      // Cross-axis hazard heuristics: a merged className variable, or another
      // padding utility still on the line, can override the removed raw pair
      // but NOT the intent (intent wins in CSS order). Review these by hand.
      if (/className(?!=)/.test(out) || /(?<![\w:-])p[xy]?-[\d.]/.test(out)) {
        warns.push(`  ${rel}:${i + 1}  ${out.trim()}`);
      }
    }
    return out;
  });
  if (fileCount > 0) {
    perFile.push([rel, fileCount]);
    if (APPLY) writeFileSync(file, next.join('\n'));
  }
}

console.log(`${APPLY ? 'REWROTE' : 'DRY RUN'} — ${total} line(s) in ${perFile.length} file(s) under ${relative(ROOT, DIR) || '.'} (combo=${COMBO})\n`);
for (const [rel, n] of perFile.sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(3)}  ${rel}`);
if (skippedDirty.length) {
  console.log(`\nSkipped ${skippedDirty.length} git-dirty file(s) (pass --include-dirty to force):`);
  for (const rel of skippedDirty) console.log(`  ${rel}`);
}
if (!APPLY && samples.length) console.log(`\nSamples:\n${samples.join('\n')}`);
if (warns.length) console.log(`\nWARN — review these rewritten lines (merged className / residual padding on the line):\n${warns.join('\n')}`);
