#!/usr/bin/env node
/**
 * Codemod: migrate the 5 legacy px font-size tokens → CF Type roles, AND
 * resolve the remaining arbitrary-px tail to named sizes (search-and-dense-ui
 * plan §2.5 T3/T4). After this the legacy tokens can be deleted from
 * tailwind.config.ts + _cn.ts.
 *
 * Legacy token → role (size-preserving where a role matches; +1–2px at the
 * retired sub-10px end, which is the plan's intent):
 *   text-mini    (8)  → text-role-micro   (10)
 *   text-eyebrow (9)  → text-role-eyebrow (11)
 *   text-micro   (10) → text-role-micro   (10)  exact
 *   text-caption (11) → text-role-caption (12)
 *   text-label   (12) → text-role-caption (12)  exact
 *
 * Remaining arbitrary `text-[Npx]` tail → nearest NAMED size (roles for body,
 * Tailwind built-ins for display/hero so heroes stay large — NOT role-display
 * 24, which would shrink them):
 *   7→role-micro · 15→role-body · 16→text-base · 20→text-xl · 22→text-2xl
 *   26→text-2xl · 28→text-3xl · 30→text-3xl · 34→text-4xl · 36→text-4xl · 40→text-4xl
 *
 * Usage:  node scripts/codemods/text-legacy-to-role.mjs          # dry run
 *         node scripts/codemods/text-legacy-to-role.mjs --apply
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const APPLY = process.argv.includes('--apply');

const TOKEN_MAP = {
  mini: 'role-micro',
  eyebrow: 'role-eyebrow',
  micro: 'role-micro',
  caption: 'role-caption',
  label: 'role-caption',
};
const PX_MAP = {
  7: 'text-role-micro',
  15: 'text-role-body',
  16: 'text-base',
  20: 'text-xl',
  22: 'text-2xl',
  26: 'text-2xl',
  28: 'text-3xl',
  30: 'text-3xl',
  34: 'text-4xl',
  36: 'text-4xl',
  40: 'text-4xl',
};

const PX_SIZES = Object.keys(PX_MAP).join('|');
const PX_RE = new RegExp(`(?<![A-Za-z0-9])text-\\[(${PX_SIZES})px\\]`, 'g');
// Each legacy token as a standalone class token (boundary-safe).
const TOKEN_RES = Object.keys(TOKEN_MAP).map(
  (t) => [new RegExp(`(?<![\\w-])text-${t}(?![\\w-])`, 'g'), `text-${TOKEN_MAP[t]}`],
);

// Never rewrite the SoT config / merge helper / guard / codemods themselves.
const SKIP = new Set([
  'utils/_cn.ts',
  ]);
function skip(rel) {
  return rel.startsWith('scripts/codemods/') || SKIP.has(relative(SRC, join(ROOT, rel)).split('\\').join('/'));
}

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
  const rel = relative(ROOT, file).split('\\').join('/');
  if (SKIP.has(relative(SRC, file).split('\\').join('/'))) continue;
  const src = readFileSync(file, 'utf8');
  let count = 0;
  const next = src
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return line;
      let out = line.replace(PX_RE, (_m, px) => {
        count += 1;
        return PX_MAP[px];
      });
      for (const [re, repl] of TOKEN_RES) {
        out = out.replace(re, () => {
          count += 1;
          return repl;
        });
      }
      return out;
    })
    .join('\n');
  if (count > 0) {
    filesChanged += 1;
    total += count;
    if (APPLY) writeFileSync(file, next);
  }
}

console.log(APPLY ? 'APPLIED' : 'DRY RUN (pass --apply)');
console.log(`  files:        ${filesChanged}`);
console.log(`  replacements: ${total}`);
