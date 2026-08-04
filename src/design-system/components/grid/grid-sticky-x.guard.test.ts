import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Sticky bottom X scrollbar is the LedgerGrid h-scroll triage affordance.
 * Body keeps `no-scrollbar`; the synced gutter must exist whenever scrollX is on.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('LedgerGrid sticky X scrollbar', () => {
  it('owns a synced sticky X gutter (not body-native bar alone)', () => {
    const grid = read('src/design-system/components/grid/LedgerGrid.tsx');
    assert.match(
      grid,
      /useSyncedHorizontalScrollbar/,
      'LedgerGrid must sync a sticky X gutter via useSyncedHorizontalScrollbar',
    );
    assert.match(
      grid,
      /GridStickyXScrollbar/,
      'LedgerGrid must render GridStickyXScrollbar when scrollX',
    );
    assert.match(
      grid,
      /data-grid-sticky-x|GridStickyXScrollbar/,
      'sticky X strip must be present in the scrollX path',
    );
  });

  it('exports the sticky X SoT from the grid barrel', () => {
    const barrel = read('src/design-system/components/grid/index.ts');
    assert.match(barrel, /GridStickyXScrollbar/);
    assert.match(barrel, /useSyncedHorizontalScrollbar/);
    assert.match(barrel, /TableStickyXScroll/);
  });

  it('gutter hard-stops overscroll-x', () => {
    const gutter = read('src/design-system/components/grid/GridStickyXScrollbar.tsx');
    assert.match(
      gutter,
      /overscroll-x-none/,
      'Sticky X gutter must hard-stop at edges (same law as LedgerGrid X ports)',
    );
    assert.match(gutter, /data-grid-sticky-x/);
  });
});
