/**
 * Guard — motion package imports stay inside the design-system motion waist.
 * App code imports `@/design-system/motion` and names `motionRole.*`.
 *
 * Run: node --import tsx --test src/design-system/foundations/motion-boundary.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const ALLOWED = new Set(['src/design-system/motion/framer.ts']);
const IMPORT_RE = /from\s+['"](motion\/react|framer-motion)['"]/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('motion boundary', () => {
  it('only src/design-system/motion/framer.ts imports motion/react or framer-motion', () => {
    const offenders: string[] = [];
    for (const abs of walk(SRC)) {
      const rel = relative(ROOT, abs).split('\\').join('/');
      const text = readFileSync(abs, 'utf8');
      IMPORT_RE.lastIndex = 0;
      if (!IMPORT_RE.test(text)) continue;
      if (!ALLOWED.has(rel)) offenders.push(rel);
    }
    assert.deepEqual(
      offenders,
      [],
      `illegal motion package import(s):\n  ${offenders.join('\n  ')}\nImport from @/design-system/motion instead.`,
    );
  });
});
