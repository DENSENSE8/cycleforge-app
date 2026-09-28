#!/usr/bin/env node
/**
 * Branding guard — fails if product-brand USAV string literals reappear in src/.
 *
 * Banned (case-sensitive) literals outside migrations / intentional fixtures:
 *   "USAV Solutions", "USAV Orders", "USAV Assistant", "USAV Ops Assistant"
 *
 * Workspace display name in the DB may still be "USAV Solutions" — that is
 * not a code literal. Dogfood infra (EBAY_USAV enum, NAS paths, env secrets)
 * is out of scope for this guard.
 *
 * Usage:
 *   node scripts/branding-guard.mjs
 *   npm run branding:guard
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(repoRoot, 'src');

const BANNED = [
  /USAV Solutions/,
  /USAV Orders/,
  /USAV Assistant/,
  /USAV Ops Assistant/,
];

const SKIP_DIRS = new Set(['migrations', 'node_modules', '.next']);

function walk(dir, out = []) {
  for (const ent of readdirSync(dir)) {
    if (SKIP_DIRS.has(ent)) continue;
    const p = join(dir, ent);
    if (statSync(p).isDirectory()) {
      walk(p, out);
    } else if (/\.(ts|tsx|js|mjs|css)$/.test(ent) && !/\.test\.(ts|tsx)$/.test(ent)) {
      out.push(p);
    }
  }
  return out;
}

const hits = [];
for (const file of walk(srcRoot)) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const re of BANNED) {
      if (re.test(line)) {
        hits.push(`${relative(repoRoot, file)}:${i + 1}: ${line.trim()}`);
      }
    }
  }
}

if (hits.length) {
  console.error('✖ branding-guard: banned USAV product-brand literals found:\n');
  for (const h of hits) console.error('  ' + h);
  console.error(
    '\nUse Cycle Forge platform constants (src/lib/branding/constants.ts) or org.name from the DB.\n' +
      'See docs/cycle-forge-branding-spec.md.',
  );
  process.exit(1);
}

console.log('✓ branding-guard: OK (no banned USAV Solutions/Orders/Assistant literals in src/).');
