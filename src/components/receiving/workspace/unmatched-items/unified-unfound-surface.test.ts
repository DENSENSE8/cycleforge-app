import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * Phase 2 guards (receiving-condition-serial-unification-plan.md) + optimistic
 * return-scan guards + Testing accordion collapse (scan-station snappy
 * propagation Phase A): the unified unfound surface is ONE row surface, return
 * import lands on the siblings cache before await, and ReturnScanCard never
 * shows a "Recording serial…" loader. Testing's centre is a pure ledger row —
 * the per-unit verdict list is the right-edge Units Action Display, opened via
 * onViewAllUnits (no centre activeRowSlot, no renderLineActions / per-line
 * list fork). The shared surface still EXPOSES activeRowSlot for other callers.
 *
 * Source-text guards (mirror po-lines-accordion-meta-order.test.ts) — read the
 * component files rather than rendering, so no DOM/react runtime is needed.
 */
const DIR = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(DIR, rel), 'utf8');

const SECTION = read('../UnmatchedItemsSection.tsx');
const SURFACE = read('UnmatchedAccordionSurface.tsx');
const SHARED = read('unmatched-items-shared.ts');
const RETURN_CARD = read('ReturnScanCard.tsx');
const HOOK = read('useUnmatchedItems.ts');
const PO_LINES_DATA = read('../hooks/usePoLinesData.ts');
const TESTING_ITEMS = readFileSync(
  join(DIR, '../../../tech/testing-panel/TestingPoItemsSection.tsx'),
  'utf8',
);

test('UnmatchedItemsSection routes every carton to the unified accordion surface', () => {
  assert.ok(
    !/isUnifiedUnfoundSurface|RECEIVING_UNIFIED_UNFOUND_SURFACE/.test(SECTION),
    'section must not reference any unified-unfound feature flag',
  );
  assert.ok(
    /<UnmatchedAccordionSurface\b/.test(SECTION),
    'section renders the unified accordion surface',
  );
  assert.ok(
    !/renderLineActions/.test(SECTION),
    'per-line renderLineActions fork is removed',
  );
  assert.ok(
    !/UnmatchedItemsPerLineList|UnmatchedLineRow/.test(SECTION),
    'per-line list and UnmatchedLineRow are gone',
  );
});

test('shared props expose activeRowSlot (not renderLineActions)', () => {
  assert.ok(/activeRowSlot\?:/.test(SHARED), 'Testing injects via activeRowSlot');
  assert.ok(
    !/renderLineActions/.test(SHARED),
    'renderLineActions capability fork must not return',
  );
  assert.ok(
    !/UnmatchedLineRenderHelpers/.test(SHARED),
    'UnmatchedLineRenderHelpers must not return',
  );
});

test('accordion surface is ONE row surface: PoLinesAccordion + shared editor leaf', () => {
  assert.ok(/<PoLinesAccordion\b/.test(SURFACE), 'must render PoLinesAccordion as the row surface');
  assert.ok(
    /<ActiveLineConditionSerial\b/.test(SURFACE),
    'default active row must use the same editor leaf as a matched PO line',
  );
  assert.ok(
    /activeRowSlotProp !== undefined/.test(SURFACE),
    'custom activeRowSlot override must be honored (Testing verdict leaf)',
  );
  assert.ok(
    !/<UnmatchedLineRow\b/.test(SURFACE),
    'accordion surface must NOT render the legacy per-line UnmatchedLineRow list',
  );
  assert.ok(/<ReturnScanCard\b/.test(SURFACE), 'empty carton keeps the scan-first-return affordance');
  assert.ok(
    /showAccordion/.test(SURFACE) && /paintPlaceholder/.test(SURFACE),
    'never-blank: placeholder keeps accordion mounted while lines clear',
  );
});

test('Unbox dual loci: unfound surface shares the capture ALS + ReturnScanCard', () => {
  assert.ok(
    /dockOwnsCapture=\{dockOwnsCapture\}[\s\S]{0,80}isActiveLine=\{isActiveLine\}/.test(
      SURFACE,
    ),
    'lined unfound reports the same facts as the matched PoLinesAccordion wiring',
  );
  assert.ok(
    /dockOwnsCapture\?:/.test(SHARED),
    'shared props expose dockOwnsCapture for Unbox dual loci',
  );
  assert.ok(
    /<PoLineCaptureRow/.test(RETURN_CARD),
    'empty ReturnScanCard mounts PoLineCaptureRow under Unbox',
  );
});

test('ReturnScanCard gates on empty carton only (no double-row)', () => {
  assert.ok(
    /hasLines \?/.test(SURFACE) ||
      /showAccordion \?/.test(SURFACE) ||
      /c\.lines\.length === 0/.test(SURFACE) ||
      /!hasLines/.test(SURFACE),
    'accordion surface keeps the empty-only ReturnScanCard gate',
  );
  assert.ok(
    /double-row/.test(SURFACE),
    'surface documents the double-row invariant',
  );
});

test('Testing centre is a pure ledger row — no per-unit activeRowSlot list', () => {
  // The per-unit verdict list moved OUT of the centre into the right-edge Units
  // Action Display (docs/todo/testing-units-to-right-rail-display-HANDOFF.md).
  // The centre PO line must not mount an under-row verdict slot on either the
  // matched or the unmatched accordion path.
  assert.ok(
    !/renderLineActions/.test(TESTING_ITEMS),
    'Testing must not pass renderLineActions',
  );
  assert.ok(
    !/activeRowSlot=\{testingActiveRowSlot\}/.test(TESTING_ITEMS),
    'Testing centre must NOT inject a verdict list via activeRowSlot — units are a right-edge Display',
  );
  assert.ok(
    !/const testingActiveRowSlot\b/.test(TESTING_ITEMS),
    'the centre activeRowSlot closure is retired — per-unit verdict is an Action Display',
  );
  assert.ok(
    /onViewAllUnits=\{onViewAllUnits\}/.test(TESTING_ITEMS),
    'the serials cell must open the right-edge Units Display via onViewAllUnits',
  );
  assert.ok(
    /activeLineId=\{row\.id\}/.test(TESTING_ITEMS),
    'Testing unfound must pass activeLineId for focus / never-blank',
  );
  assert.ok(
    /placeholderActiveRow=\{row\.id > 0 \? row : undefined\}/.test(TESTING_ITEMS),
    'Testing unfound must seed placeholderActiveRow when a real line is selected',
  );
});

test('empty unfound ReturnScanCard matches PoLineRow anatomy (title + empty SKU + condition)', () => {
  assert.ok(
    /UNFOUND_PO_DISPLAY/.test(RETURN_CARD),
    'empty stub paints the unmatched purchase order title via UNFOUND_PO_DISPLAY',
  );
  assert.ok(/<PoLineMetaGrid\b/.test(RETURN_CARD), 'meta uses the shared PoLineMetaGrid columns');
  assert.ok(
    /<EmptySkuChipFace\b/.test(RETURN_CARD),
    'empty SKU slot uses EmptySkuChipFace (matched-row parity)',
  );
  assert.ok(
    /<UnitPriceChip\b/.test(RETURN_CARD),
    'empty price slot uses UnitPriceChip (Receipt + —; matched-row parity)',
  );
  assert.ok(
    /<ConditionGradeChip\b/.test(RETURN_CARD),
    'condition stays in the meta row ConditionGradeChip slot',
  );
  assert.ok(/embedded/.test(RETURN_CARD), 'SerialCard is embedded inside the row body');
});

test('ReturnScanCard uses flat PoLineRow chrome (no blue card bubble)', () => {
  // Same data-floor contract as po-line-flat-chrome.guard.test.ts — unfound
  // empty stub must not reintroduce the rounded blue card that found lines lost.
  assert.ok(/QUEUE_ROW\.selectedStationClass/.test(RETURN_CARD), 'opaque station selected face');
  assert.ok(/rounded-none/.test(RETURN_CARD), 'no card radius');
  assert.ok(/border-b border-border-soft/.test(RETURN_CARD), 'hairline bottom only');
  assert.ok(/pl-0 pr-0/.test(RETURN_CARD), 'flush left/right — no side pad');
  assert.ok(
    !/border-blue-300 bg-blue-50\/60/.test(RETURN_CARD),
    'must not paint the legacy blue unfound card wash',
  );
  assert.ok(
    !/rounded-xl border/.test(RETURN_CARD),
    'card bubbles (rounded-xl + full border) are banned on the data floor',
  );
  assert.ok(
    !/px-3 pb-1 pt-1/.test(RETURN_CARD),
    'must not keep the old inset pad around title/serial',
  );
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

test('refreshLines merges with preserve — never hard-replaces body.lines (Testing paint SoT)', () => {
  assert.ok(
    /mergeUnfoundLinesWithPreserve\(/.test(HOOK),
    'refreshLines must merge via mergeUnfoundLinesWithPreserve so optimistic chips survive',
  );
  assert.ok(
    !/setLines\(body\.lines/.test(HOOK),
    'bare setLines(body.lines) wipes Testing last-8 during create→attach',
  );
  assert.ok(
    /returnScanBusyRef/.test(HOOK),
    'non-ok / catch must consult returnScanBusy before clearing local lines',
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
