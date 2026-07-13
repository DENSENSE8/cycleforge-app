import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * Phase 2 guards (receiving-condition-serial-unification-plan.md): the unified
 * unfound surface is ONE row surface routed through PoLinesAccordion behind the
 * flag, and the return import lands on the shared siblings cache — while the
 * legacy path stays intact behind the default-off flag.
 *
 * Source-text guards (mirror po-lines-accordion-meta-order.test.ts) — read the
 * component files rather than rendering, so no DOM/react runtime is needed.
 */
const DIR = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(DIR, rel), 'utf8');

const SECTION = read('../UnmatchedItemsSection.tsx');
const SURFACE = read('UnmatchedAccordionSurface.tsx');

test('UnmatchedItemsSection routes every receiving carton to the unified surface, no flag', () => {
  // No feature flag anywhere — the unified surface is the only receiving path.
  assert.ok(
    !/isUnifiedUnfoundSurface|RECEIVING_UNIFIED_UNFOUND_SURFACE/.test(SECTION),
    'section must not reference any unified-unfound feature flag',
  );
  assert.ok(
    /<UnmatchedAccordionSurface\b/.test(SECTION),
    'the default (receiving) path renders the unified accordion surface',
  );
  // The per-line list survives ONLY for the testing renderLineActions capability.
  assert.ok(
    /if \(props\.renderLineActions\)/.test(SECTION),
    'the per-line list is reached only via the renderLineActions capability fork',
  );
  assert.ok(/<UnmatchedLineRow\b/.test(SECTION), 'per-line list keeps the UnmatchedLineRow renderer');
});

test('accordion surface is ONE row surface: PoLinesAccordion + shared editor leaf', () => {
  assert.ok(/<PoLinesAccordion\b/.test(SURFACE), 'must render PoLinesAccordion as the row surface');
  assert.ok(
    /<ActiveLineConditionSerial\b/.test(SURFACE),
    'active row must use the same editor leaf as a matched PO line',
  );
  // The standing scanner appears ONLY as the empty-carton affordance; never a
  // forked per-line list beside the accordion.
  assert.ok(
    !/<UnmatchedLineRow\b/.test(SURFACE),
    'accordion surface must NOT render the legacy per-line UnmatchedLineRow list',
  );
  assert.ok(/<ReturnScanCard\b/.test(SURFACE), 'empty carton keeps the scan-first-return affordance');
});

test('return import writes the shared receivingSiblingsQueryKey cache', () => {
  assert.ok(
    /writeReceivingSiblingLine\(/.test(SURFACE),
    'a created line must be upserted into the accordion siblings cache (reflow in place)',
  );
});
