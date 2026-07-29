/**
 * Hard law: a LedgerGrid column's DISPLAY contract is decided once, on the
 * column model — never re-decided per surface.
 *
 * Three patterns drifted across the seven grid families before this guard, each
 * because the decision lived at the call site instead of on the model:
 *
 * 1. **Alignment ternaries.** `column.key === 'qty' ? 'end' : 'start'` in each
 *    header, and a hand-typed `justify-end` on each cell. Two files, two
 *    vocabularies, one decision — so Catalog and Repair ended up left-aligning
 *    headers over right-aligned numbers, and Pending left-aligned a column its
 *    own SoT declared `type: 'number'`. Now: `resolveGridColumnAlign(column)`.
 * 2. **Zebra fills.** `index % 2 === 1 ? 'bg-surface-canvas' : 'bg-surface-card'`
 *    typed byte-identically into four row shells, on surfaces that already draw
 *    a full cell rule grid. Now: `ledgerRowStateClass(selected)`.
 * 3. **Doubled cell glyphs.** A typed header draws the column's type glyph, and
 *    the value chip drew the same glyph again in every row (the Unbox tracking
 *    MapPin). Now: `omitCellIcon` on the column.
 *
 * Source guard — cheaper than mounting seven grids, and it pins the shape
 * rather than the pixels. Ratchet: these lists only shrink.
 *
 * Run: `npx tsx --test src/design-system/components/grid/grid-column-display.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../../..');

/** Every LedgerGrid leaf/group row that renders value cells. */
const GRID_ROWS = [
  'src/components/station/receiving-grid/ReceivingGridRow.tsx',
  'src/components/station/incoming-grid/IncomingGridRow.tsx',
  'src/components/products/catalog/catalog-grid/CatalogGridRow.tsx',
  'src/components/repair/repair-grid/RepairGridRow.tsx',
  'src/components/receiving/pickup/grid/PickupGridGroupRow.tsx',
] as const;

/** Every LedgerGrid column header. */
const GRID_HEADERS = [
  'src/components/station/receiving-grid/ReceivingGridColumnHeader.tsx',
  'src/components/station/incoming-grid/IncomingGridColumnHeader.tsx',
  'src/components/products/catalog/catalog-grid/CatalogGridColumnHeader.tsx',
  'src/components/repair/repair-grid/RepairGridColumnHeader.tsx',
  'src/components/receiving/pickup/grid/PickupGridColumnHeader.tsx',
  'src/components/dashboard/orders-queue/OrdersQueueColumnHeader.tsx',
] as const;

function code(relative: string): string {
  return readFileSync(resolve(ROOT, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

test('no grid row paints a zebra stripe', () => {
  for (const file of GRID_ROWS) {
    const src = code(file);
    assert.equal(
      /index % 2/.test(src),
      false,
      `${file} re-introduced an index-parity row fill — LedgerGrid rows draw cell rules, so a stripe is a third separation system. Use ledgerRowStateClass(selected).`,
    );
    // Not a blanket `bg-surface-canvas` ban — it is a legitimate INNER fill
    // (the Catalog thumbnail placeholder sits on it). What must not come back
    // is the canvas value used as the ROW fill, which is what the parity check
    // above catches; this pins the replacement so the shell cannot quietly
    // grow its own fill instead.
    assert.ok(
      src.includes('ledgerRowStateClass('),
      `${file} does not compose ledgerRowStateClass — the row shell must take its interactive chrome and state fill from the SoT.`,
    );
  }
});

test('no grid row hand-types a cell justification', () => {
  for (const file of GRID_ROWS) {
    assert.equal(
      code(file).includes('justify-end'),
      false,
      `${file} hand-typed justify-end. Alignment comes from the column model via gridCellAlignClass(col) — a cell that disagrees with its header is exactly the drift this replaces.`,
    );
  }
});

test('no header re-decides alignment from a column key', () => {
  for (const file of GRID_HEADERS) {
    const src = code(file);
    if (!src.includes('gridHeaderCellAlignClass')) continue;
    assert.equal(
      /gridHeaderCellAlignClass\(\s*(?:column\.key|[a-zA-Z]*[aA]lignEnd)/.test(src),
      false,
      `${file} decides alignment from a column key. Pass resolveGridColumnAlign(column) so the header and its cells resolve the SAME decision.`,
    );
    assert.equal(
      /gridHeaderCellAlignClass\(\s*\)/.test(src),
      false,
      `${file} calls gridHeaderCellAlignClass() with no argument, which pins every header to start even over numeric tracks. Pass resolveGridColumnAlign(column).`,
    );
  }
});

test('the row-state SoT stays zebra-free', () => {
  const src = code('src/components/ui/queue-row-chrome.ts');
  assert.ok(src.includes('ledgerRowStateClass'), 'the row-state SoT is missing');
  assert.equal(
    /index|% 2|bg-surface-canvas/.test(src),
    false,
    'zebra came back in the row-state SoT itself',
  );
});
