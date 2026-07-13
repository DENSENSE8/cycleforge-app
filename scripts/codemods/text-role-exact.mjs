#!/usr/bin/env node
/**
 * Codemod: arbitrary `text-[Npx]` → CF Type role classes (search-and-dense-ui
 * plan §2.5-T3). ONLY the exact-size (or ±1px negligible) mappings are auto-
 * applied — zero/near-zero visual change, pure debt→role conversion:
 *
 *   9  → text-role-micro    (9→10, +1 negligible; no 9px role)
 *   10 → text-role-micro    (exact)
 *   11 → text-role-caption  (11→12, +1 negligible)
 *   12 → text-role-caption  (exact)
 *   13 → text-role-data     (exact)   ← the biggest tail (54 sites)
 *   14 → text-role-body     (exact)
 *   18 → text-role-title    (exact)
 *   24 → text-role-display  (exact)
 *
 * DELIBERATELY LEFT for manual/visual QA (lossy or hero sizes with no role):
 * 7, 15, 16, 20, 22, and 26–40px (KPI/display heroes — role scale tops at 24,
 * so a blind map would SHRINK them). The plan mandates staged, screenshot-
 * verified fan-out for those.
 *
 * Roles are registered in `_cn.ts` (CUSTOM_FONT_SIZES) so they survive twMerge.
 * Usage:  node scripts/codemods/text-role-exact.mjs          # dry run
 *         node scripts/codemods/text-role-exact.mjs --apply
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const APPLY = process.argv.includes('--apply');

// exact/±1 px → role class. Keep in sync with tailwind.config.ts role-* tokens.
const MAP = {
  9: 'text-role-micro',
  10: 'text-role-micro',
  11: 'text-role-caption',
  12: 'text-role-caption',
  13: 'text-role-data',
  14: 'text-role-body',
  18: 'text-role-title',
  24: 'text-role-display',
};

const SIZES = Object.keys(MAP).join('|');
const RE = new RegExp(`(?<![A-Za-z0-9])text-\\[(${SIZES})px\\]`, 'g');

// Never rewrite files that document the raw strings on purpose.
const SKIP = new Set([
  'scripts/codemods/text-role-exact.mjs',
  'scripts/codemods/text-size-tokens.mjs',
  'components/ui/typography-tokens.guard.test.ts',
]);

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
let totalReplacements = 0;
const perSize = Object.fromEntries(Object.keys(MAP).map((k) => [k, 0]));

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (SKIP.has(relative(SRC, file).split('\\').join('/'))) continue;
  const src = readFileSync(file, 'utf8');
  let count = 0;
  const next = src
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        return line;
      }
      return line.replace(RE, (_m, px) => {
        count += 1;
        perSize[px] += 1;
        return MAP[px];
      });
    })
    .join('\n');
  if (count > 0) {
    filesChanged += 1;
    totalReplacements += count;
    if (APPLY) writeFileSync(file, next);
    console.log(`${APPLY ? '✎' : '·'} ${rel} (${count})`);
  }
}

console.log('\n' + (APPLY ? 'APPLIED' : 'DRY RUN (pass --apply to write)'));
console.log(`  files:        ${filesChanged}`);
console.log(`  replacements: ${totalReplacements}`);
for (const [px, cls] of Object.entries(MAP)) {
  console.log(`    text-[${px}px] → ${cls.padEnd(18)} ${perSize[px]}`);
}
