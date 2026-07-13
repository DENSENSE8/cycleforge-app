#!/usr/bin/env node
/**
 * Codemod: retire `font-black` (900) on the ≤11px CF Type roles (search-and-
 * dense-ui plan §2.1-6 / §2.5 T3 "retire font-black ≤11px"). `text-role-eyebrow`
 * (11) and `text-role-micro` (10) already BAKE weight 600 — `font-black` was the
 * old station tic that muddies at that size. Strip it on any line that carries
 * one of those roles so the role's 600 applies (Linear/Geist calm-weight).
 *
 * Only lines containing text-role-eyebrow / text-role-micro are touched; larger
 * roles keep their explicit weight. Comment lines are skipped.
 *
 * Usage:  node scripts/codemods/strip-font-black-small.mjs          # dry run
 *         node scripts/codemods/strip-font-black-small.mjs --apply
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const APPLY = process.argv.includes('--apply');

const SMALL_ROLE_RE = /text-role-(eyebrow|micro)(?![\w-])/;
const FONT_BLACK_RE = /(?<![\w-])font-black(?![\w-]) ?/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

let filesChanged = 0;
let total = 0;
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  let count = 0;
  const next = src
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return line;
      if (!SMALL_ROLE_RE.test(line)) return line;
      return line.replace(FONT_BLACK_RE, () => {
        count += 1;
        return '';
      });
    })
    .join('\n');
  if (count > 0) {
    filesChanged += 1;
    total += count;
    if (APPLY) writeFileSync(file, next);
    console.log(`${APPLY ? '✎' : '·'} ${relative(ROOT, file)} (${count})`);
  }
}

console.log('\n' + (APPLY ? 'APPLIED' : 'DRY RUN (pass --apply)'));
console.log(`  files: ${filesChanged}  ·  font-black removed: ${total}`);
