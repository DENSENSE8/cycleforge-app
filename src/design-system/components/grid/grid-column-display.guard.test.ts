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
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../../..');

/**
 * Grid families are DISCOVERED, never hand-listed.
 *
 * The first cut of this guard enumerated the files by hand — and the list was
 * copied from the diff that introduced it, so it certified a half-migrated
 * surface as green: both `*GridGroupSummary` files kept their hand-typed
 * `justify-end` and their duplicate tracking glyph, and the operator saw a map
 * pin on fold rows and not on leaf rows in the SAME column. A guard whose scope
 * is drawn from the change it is guarding proves only that the change happened.
 *
 * So: walk the grid directories and take every row / summary / header file that
 * actually renders cells. A new grid family, or a file someone forgot, joins
 * the guard by existing.
 */
const GRID_DIRS = [
  'src/components/station/receiving-grid',
  'src/components/station/incoming-grid',
  'src/components/products/catalog/catalog-grid',
  'src/components/repair/repair-grid',
  'src/components/receiving/pickup/grid',
  'src/components/dashboard/orders-queue',
] as const;

function filesIn(dir: string): string[] {
  return readdirSync(resolve(ROOT, dir))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => `${dir}/${f}`);
}

const ALL_GRID_FILES = GRID_DIRS.flatMap(filesIn);

function code(relative: string): string {
  return readFileSync(resolve(ROOT, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

/** Files that render the column header band. */
const GRID_HEADERS = ALL_GRID_FILES.filter((f) => code(f).includes('gridHeaderCellAlignClass'));

/**
 * Files that render VALUE cells (leaf rows, group summaries, group rows).
 * Headers also carry `data-col`, so they are excluded — they are held to the
 * header rules below instead, and have no row shell to fill.
 */
const GRID_ROWS = ALL_GRID_FILES.filter(
  (f) => /data-col=/.test(code(f)) && !GRID_HEADERS.includes(f),
);

test('the guard actually discovered the grid families', () => {
  // A glob that silently matches nothing would make every assertion below pass.
  assert.ok(GRID_ROWS.length >= 8, `expected the grid row/summary set, got ${GRID_ROWS.length}`);
  assert.ok(GRID_HEADERS.length >= 5, `expected the grid headers, got ${GRID_HEADERS.length}`);
});

/**
 * Surfaces that legitimately still stripe, with the reason. NOT a silent skip —
 * an entry here is a claim someone can check.
 *
 * `OrdersQueueTableRow` renders three surfaces from one component: the airtable
 * Pending grid (already zebra-free via `useAlternateStripe && !gridSkin`), and
 * the board / mobile card lists, which draw NO cell rules. Zebra is the row
 * tracking of last resort on a rule-less list, which is the one condition it
 * actually earns. Removing it there is a separate decision about a different
 * surface — see the open question in the display SoT notes.
 */
const ZEBRA_EXEMPT = new Set([
  'src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx',
]);

test('no grid row paints a zebra stripe', () => {
  for (const file of GRID_ROWS) {
    const src = code(file);
    if (ZEBRA_EXEMPT.has(file)) {
      // Pin the exemption's premise: it is only defensible while the grid path
      // itself stays striped-off. If that guard clause goes, so does the reason.
      assert.ok(
        src.includes('!gridSkin'),
        `${file} is zebra-exempt only because the airtable grid path opts OUT of the stripe; that opt-out is gone.`,
      );
      continue;
    }
    assert.equal(
      /index % 2/.test(src),
      false,
      `${file} re-introduced an index-parity row fill — LedgerGrid rows draw cell rules, so a stripe is a third separation system. Use ledgerRowStateClass(selected).`,
    );
    // Conditional, not blanket: a group SUMMARY renders inside
    // `CollapsibleGroupRow`, which owns its fill, so it paints no row state at
    // all and has nothing to compose. The rule is therefore "IF you paint a row
    // fill, take it from the SoT" — hand-rolling the selected fill beside a
    // hand-rolled default is how the stripe got in the first place.
    assert.equal(
      src.includes('QUEUE_ROW.selectedClass'),
      false,
      `${file} hand-rolls the selected-row fill. A file that paints row state must use ledgerRowStateClass(selected), which owns default + hover + selected together.`,
    );
  }
});

test('no grid row hand-types a CELL justification', () => {
  for (const file of GRID_ROWS) {
    // Scoped to the cell wrapper, not the file: `justify-end` is fine on inner
    // chrome (a corner indicator, an absolutely-positioned badge). What must
    // not come back is a justification typed onto the CELL, because that is the
    // half of the decision that silently disagrees with the header.
    const offenders = code(file)
      .split('\n')
      .filter((line) => /justify-end/.test(line) && /(dataCell\(|data-col=)/.test(line));
    assert.deepEqual(
      offenders,
      [],
      `${file} hand-types a cell justification:\n  ${offenders.join('\n  ')}\nAlignment comes from the column model via gridCellAlignClass(col).`,
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

/** Every surface's column-model file. Geometry must delegate, never re-derive. */
const LAYOUT_FILES = [
  'src/lib/receiving/receiving-grid-layout.ts',
  'src/lib/receiving/incoming-grid-layout.ts',
  'src/lib/products/catalog-grid-layout.ts',
  'src/lib/repair/repair-grid-layout.ts',
  'src/components/receiving/pickup/grid/pickup-grid-layout.ts',
  'src/lib/dashboard-order-row-layout.ts',
] as const;

test('no surface re-implements grid column geometry', () => {
  // These four bodies existed six times over, byte-identical. The cost was not
  // the duplication — it was that the label-aware header-fit fix landed on ONE
  // copy, leaving the other five clipping headers for weeks. Delegation is what
  // makes the next fix land everywhere at once.
  for (const file of LAYOUT_FILES) {
    const src = code(file);
    assert.equal(
      /\.width\.match\(/.test(src),
      false,
      `${file} parses a track width itself — call gridColumnTrackRem from grid-column-geometry.`,
    );
    assert.equal(
      />=\s*\(?\s*(?:fit|column\.labelFitRem)/.test(src),
      false,
      `${file} re-derives the header-fit test. Use gridHeaderShowsLabel — it also checks the label FITS, which a bare width threshold does not.`,
    );
    assert.equal(
      /`var\(--cf-col-/.test(src),
      false,
      `${file} builds a grid template inline — call gridTemplate / gridColVar.`,
    );
    assert.equal(
      /reduce\(\(sum, c\) => sum \+ \w*ColumnTrackRem/.test(src),
      false,
      `${file} re-sums the content-min width — call gridContentMinWidthRem.`,
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
