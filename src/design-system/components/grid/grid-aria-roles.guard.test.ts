import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Grid ARIA structure SoT.
 *
 * `role="row"` has a REQUIRED context role of `rowgroup` / `table` / `grid` /
 * `treegrid`, and `role="columnheader"` requires a `row` inside a table/grid
 * context (WAI-ARIA 1.2, §5.3.2 "Required Context Role"). Before 2026-07-27 the
 * six grid column-header components asserted both roles inside a plain `<div>`
 * with no such ancestor — spec-invalid partial table semantics, which is worse
 * than no roles at all because it claims a structure that isn't there.
 *
 * `LedgerGrid` now supplies the missing context: `role="table"` on the surface
 * and `role="rowgroup"` on the header band.
 *
 * **`table`, not `grid`, is deliberate.** ARIA `grid` is a composite widget;
 * asserting it obligates the full APG grid keyboard contract (roving tabindex,
 * arrow-key cell navigation, Home/End, Ctrl+Home/End). This shell implements
 * none of that, so `grid` would be a false claim. Do not "upgrade" the role
 * without shipping the keyboard model with it.
 *
 * KNOWN REMAINING GAP (deliberately not asserted here): body rows still carry no
 * `role="row"` / `aria-rowindex`, so a virtualized 1,000-row list exposes no row
 * structure. Fixing that needs a decision on how folded groups map to ARIA
 * (`treegrid`? `rowgroup` per fold?) and an absolute-index contract through the
 * virtualizer — tracked in `docs/todo/ops-table-simplification-GEMINI-FOLLOWUP.md` §4.
 * This guard exists so the container/header half cannot silently regress while
 * that decision is pending.
 */

const GRID_DIR = fileURLToPath(new URL('.', import.meta.url));
const SRC_DIR = fileURLToPath(new URL('../../../', import.meta.url));

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Drop block + line comments so prose ABOUT a role never reads as a use of it. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Recursively collect `.tsx` files under `dir`. */
function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectTsx(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('grid ARIA structure', () => {
  const ledgerGrid = read(join(GRID_DIR, 'LedgerGrid.tsx'));

  it('LedgerGrid asserts role="table" on the grid surface', () => {
    assert.match(
      ledgerGrid,
      /role=\{empty \? undefined : 'table'\}/,
      'LedgerGrid must expose role="table" on the surface (omitted while empty) so ' +
        'the column-header row/columnheader roles have their required context.',
    );
  });

  it('LedgerGrid never claims role="grid" without the APG keyboard contract', () => {
    assert.doesNotMatch(
      ledgerGrid,
      /role=(["']grid["']|\{['"]grid['"]\})/,
      'role="grid" is a composite-widget claim that obligates roving tabindex + ' +
        'arrow-key cell navigation. Ship the keyboard model in the same change or ' +
        'keep role="table".',
    );
  });

  it('LedgerGrid wraps the column header in role="rowgroup"', () => {
    assert.match(
      ledgerGrid,
      /role="rowgroup"[\s\S]{0,120}data-grid-col-header/,
      'The sticky column-header band must be a rowgroup; without it the header ' +
        'row/columnheader roles are orphaned.',
    );
  });

  it('LedgerGrid accepts an accessible name for the table', () => {
    assert.match(
      ledgerGrid,
      /'aria-label'\?: string/,
      'A role="table" with no accessible name announces as a bare "table".',
    );
  });

  it('both grid composers REQUIRE an accessible name from their callers', () => {
    // Optional here would silently reintroduce anonymous tables at every new
    // call site. `LedgerGrid` keeps it optional (it is the low-level shell);
    // the two composers every product surface actually mounts do not.
    const composers: [string, string][] = [
      ['LedgerGridSurface.tsx', join(GRID_DIR, 'LedgerGridSurface.tsx')],
      [
        'OrdersGridView.tsx',
        join(SRC_DIR, 'components/dashboard/orders-queue/OrdersGridView.tsx'),
      ],
    ];
    for (const [name, path] of composers) {
      const source = stripComments(read(path));
      assert.match(
        source,
        /\n\s*ariaLabel: string;/,
        `${name} must declare \`ariaLabel: string\` (required, not optional) so ` +
          'every mounted table carries an accessible name.',
      );
      assert.match(
        source,
        /aria-label=\{ariaLabel\}/,
        `${name} declares ariaLabel but must also forward it to LedgerGrid.`,
      );
    }
  });

  it('no component asserts role="row" or role="columnheader" outside a grid header', () => {
    // Every column-header component is passed to LedgerGrid as `columnHeader`,
    // which now supplies the rowgroup/table context. Any NEW file asserting these
    // roles elsewhere is very likely re-creating the orphan bug.
    const ALLOWED = new Set([
      'CatalogGridColumnHeader.tsx',
      'IncomingGridColumnHeader.tsx',
      'OrdersQueueColumnHeader.tsx',
      'PickupGridColumnHeader.tsx',
      'ReceivingGridColumnHeader.tsx',
      'RepairGridColumnHeader.tsx',
      // Rendered OUTSIDE LedgerGrid on StationListTable's non-virtualized path —
      // still orphaned there. Tracked as the remaining gap; do not add to this
      // list, shrink it.
      'StationRowColumnHeader.tsx',
    ]);

    const offenders = collectTsx(SRC_DIR)
      .filter((file) => /role="(row|columnheader)"/.test(stripComments(read(file))))
      .map((file) => file.slice(SRC_DIR.length))
      .filter((rel) => !ALLOWED.has(rel.split('/').pop() ?? ''));

    assert.deepEqual(
      offenders,
      [],
      'These files assert row/columnheader roles but are not known grid column ' +
        'headers. Either render them inside LedgerGrid (which supplies the ' +
        'table/rowgroup context) or drop the roles:\n  ' + offenders.join('\n  '),
    );
  });
});
