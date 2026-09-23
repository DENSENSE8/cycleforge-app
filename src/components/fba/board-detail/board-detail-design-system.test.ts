/**
 * Industrial paint contracts for the FBA board-detail cohort.
 *
 * npx tsx --test src/components/fba/board-detail/board-detail-design-system.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const panel = read('../FbaBoardDetailPanel.tsx');
const entry = read('./PlanEntryCard.tsx');
const deletion = read('./FbaDeleteControl.tsx');
const rawPaint = /(?:text|bg|border|ring|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|\brounded-(?!none\b)|\bshadow-(?!none\b)/;

test('board-detail status, scan activity, and delete states use semantic roles', () => {
  assert.match(panel, /bg-surface-accent/);
  assert.match(panel, /text-text-success/);
  assert.match(entry, /border-border-danger bg-surface-danger/);
  assert.match(deletion, /border-border-danger bg-surface-danger/);
});

test('board-detail has no raw palette, rounded, or shadow utilities', () => {
  for (const [name, source] of Object.entries({ panel, entry, deletion })) {
    assert.doesNotMatch(source, rawPaint, name);
  }
});
