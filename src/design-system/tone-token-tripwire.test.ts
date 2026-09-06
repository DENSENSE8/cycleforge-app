import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tone-token tripwire (admin dissolution W4, 2026-09-06).
 *
 * The admin / settings trees hand-rolled status pills from raw palette
 * classes (`bg-red-50 text-red-700`, `bg-blue-50 text-blue-700`, …) — 604 of
 * them across 91 files. Raw classes ignore the 8 theme palettes, so 7 themes
 * rendered them wrong. The codemod moved every one onto the themed trio
 * (`bg-surface-<tone>` + `text-<tone>` + `border-<tone>`).
 *
 * This test fails if a raw tone-color utility reappears in those trees. Gray
 * neutrals and vendor BRAND monograms (registry.ts badge colors) are exempt —
 * brand identity is not a status tone. New status UI uses the themed tokens.
 */

const TREES = [
  'src/components/admin',
  'src/components/settings',
  'src/app/settings',
] as const;

/** Vendor brand identity (monogram badges), not status semantics. */
const ALLOWED_FILES: Record<string, true> = {
  'src/app/settings/integrations/registry.ts': true,
};

const RAW_TONE = /\b(?:bg|text|border|ring|divide)-(?:red|rose|emerald|green|lime|amber|orange|yellow|blue|sky|indigo|cyan)-\d{2,3}(?:\/\d{1,3})?\b/g;

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) collect(p, out);
    else if (/\.(tsx|ts)$/.test(entry) && !/\.test\.ts$/.test(entry)) out.push(p);
  }
  return out;
}

test('admin and settings trees paint status tones with themed tokens, not raw palette classes', () => {
  const offenders: string[] = [];
  for (const tree of TREES) {
    for (const file of collect(tree)) {
      const rel = file.replace(/\\/g, '/');
      if (ALLOWED_FILES[rel]) continue;
      const src = readFileSync(file, 'utf8');
      const hits = src.match(RAW_TONE);
      if (hits?.length) {
        offenders.push(`${rel}: ${[...new Set(hits)].join(', ')}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    [
      'Raw tone-color utilities crept back into admin/settings trees.',
      'Use the themed trio instead: bg-surface-<tone> / text-<tone> / border-<tone>',
      '(solid fills: bg-fill-<tone>). Offenders:',
      ...offenders,
    ].join('\n'),
  );
});
