import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * Phase 2 guards (receiving-condition-serial-unification-plan.md) + optimistic
 * return-scan guards: the unified unfound surface is ONE row surface, return
 * import lands on the siblings cache before await, and ReturnScanCard never
 * shows a "Recording serial…" loader.
 *
 * Source-text guards (mirror po-lines-accordion-meta-order.test.ts) — read the
 * component files rather than rendering, so no DOM/react runtime is needed.
 */
const DIR = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(DIR, rel), 'utf8');

const SECTION = read('../UnmatchedItemsSection.tsx');
const SURFACE = read('UnmatchedAccordionSurface.tsx');
const RETURN_CARD = read('ReturnScanCard.tsx');
const HOOK = read('useUnmatchedItems.ts');
const PO_LINES_DATA = read('../hooks/usePoLinesData.ts');

test('UnmatchedItemsSection routes every receiving carton to the unified surface, no flag', () => {
  assert.ok(
    !/isUnifiedUnfoundSurface|RECEIVING_UNIFIED_UNFOUND_SURFACE/.test(SECTION),
    'section must not reference any unified-unfound feature flag',
  );
  assert.ok(
    /<UnmatchedAccordionSurface\b/.test(SECTION),
    'the default (receiving) path renders the unified accordion surface',
  );
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
  assert.ok(
    !/<UnmatchedLineRow\b/.test(SURFACE),
    'accordion surface must NOT render the legacy per-line UnmatchedLineRow list',
  );
  assert.ok(/<ReturnScanCard\b/.test(SURFACE), 'empty carton keeps the scan-first-return affordance');
});

test('empty unfound ReturnScanCard matches PoLineRow anatomy (title + empty SKU + condition)', () => {
  assert.ok(/Unfound PO/.test(RETURN_CARD), 'empty stub paints the Unfound PO title');
  assert.ok(/<PoLineMetaGrid\b/.test(RETURN_CARD), 'meta uses the shared PoLineMetaGrid columns');
  assert.ok(
    /<EmptySkuChipFace\b/.test(RETURN_CARD),
    'empty SKU slot uses EmptySkuChipFace (matched-row parity)',
  );
  assert.ok(
    /<ConditionGradeChip\b/.test(RETURN_CARD),
    'condition stays in the meta row ConditionGradeChip slot',
  );
  assert.ok(/embedded/.test(RETURN_CARD), 'SerialCard is embedded inside the row body');
});

test('return import writes the shared receivingSiblingsQueryKey cache', () => {
  assert.ok(
    /writeReceivingSiblingLine\(/.test(SURFACE),
    'a created line must be upserted into the accordion siblings cache (reflow in place)',
  );
});

test('ReturnScanCard never shows a Recording serial loader', () => {
  assert.ok(
    !/Recording serial/i.test(RETURN_CARD),
    'empty-carton scanner must not block on a Recording serial… resultSlot',
  );
  assert.ok(
    !/resultSlot/.test(RETURN_CARD),
    'ReturnScanCard must not wire an isSubmitting resultSlot',
  );
  assert.ok(
    /isSubmitting=\{false\}/.test(RETURN_CARD),
    'SerialCard stays interactive — optimistic surface swap is the feedback',
  );
});

test('handleReturnSerialScan writes optimistic line before first await', () => {
  assert.ok(
    /buildOptimisticReturnLine\(/.test(HOOK),
    'return scan must build an optimistic line via the shared helper',
  );
  assert.ok(
    /writeReceivingSiblingLine\(/.test(HOOK),
    'optimistic line must land on the siblings cache',
  );
  const optIdx = HOOK.indexOf('buildOptimisticReturnLine(');
  const awaitIdx = HOOK.indexOf("await fetch('/api/receiving/add-unmatched-line'");
  assert.ok(optIdx >= 0 && awaitIdx > optIdx, 'optimistic write must precede add-unmatched-line await');
  assert.ok(
    !/serial-units\/lookup/.test(HOOK),
    'pre-scan lookup hop removed — server return-linkage resolves on scan-serial',
  );
  assert.ok(
    /confirmOptimisticSerial\(/.test(HOOK),
    'scan success confirms the optimistic serial with the real serial_unit id',
  );
  assert.ok(
    /publishLineSerials\(/.test(HOOK),
    'confirmed serials dual-write via publishLineSerials',
  );
});

test('useActiveUnfoundLineSerials uses optimistic-serials CRUD (append/delete)', () => {
  assert.ok(/appendOptimisticSerial\(/.test(SURFACE), 'unfound per-line scan appends optimistically');
  assert.ok(/markSerialRemoving\(/.test(SURFACE), 'unfound delete marks removing optimistically');
  assert.ok(/removeSerialById\(/.test(SURFACE), 'unfound delete removes from cache on success');
  assert.ok(/setSerialGrade\(/.test(SURFACE), 'unfound grade uses optimistic setSerialGrade');
});

test('usePoLinesData preserves cached serials when metadata returns empty projection', () => {
  assert.ok(
    /shouldPreserveCachedSerials\(/.test(PO_LINES_DATA),
    'metadata refetch must use shouldPreserveCachedSerials (empty [] ≠ authoritative)',
  );
  assert.ok(
    /upsertSiblingLine\(/.test(PO_LINES_DATA),
    'receiving-line-updated must upsert new lines (return-scan create)',
  );
});
