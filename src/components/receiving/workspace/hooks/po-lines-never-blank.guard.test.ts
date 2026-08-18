/**
 * Never-blank PO lines — cold siblings key must paint from placeholder, not
 * return null / filterLinesByPoGroup([], anchor) → [].
 *
 * Run: `npx tsx --test src/components/receiving/workspace/hooks/po-lines-never-blank.guard.test.ts`
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(DIR, rel), 'utf8');

describe('PO lines never-blank cache paint', () => {
  const dataHook = read('usePoLinesData.ts');
  const accordion = read('../PoLinesAccordion.tsx');
  const unmatched = read('../unmatched-items/UnmatchedAccordionSurface.tsx');
  const unmatchedHook = read('../unmatched-items/useUnmatchedItems.ts');

  it('usePoLinesData paints [placeholderActiveRow] when cartonRows is empty', () => {
    assert.match(
      dataHook,
      /cartonRows\.length === 0[\s\S]*placeholderActiveRow/,
      'empty siblings must fall back to the clicked placeholder row',
    );
    assert.match(
      dataHook,
      /seedReceivingSiblingsCache/,
      'cold carton key must eager-seed the siblings cache',
    );
  });

  it('PoLinesAccordion does not bare-return null without checking placeholder', () => {
    assert.match(
      accordion,
      /placeholderActiveRow && placeholderActiveRow\.id > 0/,
      'null gate must allow a known active row through',
    );
    assert.match(accordion, /paintRows/, 'render must use paintRows (placeholder fallback)');
  });

  it('UnmatchedAccordionSurface passes placeholderActiveRow into PoLinesAccordion', () => {
    assert.match(
      unmatched,
      /placeholderActiveRow=\{/,
      'unfound path must seed the accordion like matched PO / Testing',
    );
    assert.match(
      unmatched,
      /showAccordion/,
      'known placeholder must keep accordion mounted (never flash ReturnScanCard)',
    );
    assert.match(
      unmatched,
      /paintPlaceholder/,
      'host placeholderActiveRow must win over cleared local lines',
    );
  });

  it('useUnmatchedItems clears lines on receivingId change before refresh', () => {
    assert.match(
      unmatchedHook,
      /setLines\(\[\]\);\s*\n\s*void refreshLines\(\)/,
      'foreign carton rows must not paint as last-selection during GET',
    );
    assert.doesNotMatch(
      unmatchedHook,
      /setLines\(body\.lines/,
      'bare setLines(body.lines) hard-replace is banned (preserve optimistic chips)',
    );
  });
});
