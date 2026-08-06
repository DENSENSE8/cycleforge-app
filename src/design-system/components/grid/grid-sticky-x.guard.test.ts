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

  it('paints an always-on custom thumb (not macOS overlay-only native bar)', () => {
    const gutter = read('src/design-system/components/grid/GridStickyXScrollbar.tsx');
    assert.match(
      gutter,
      /role="slider"/,
      'Must paint a persistent custom thumb — native overlay bars vanish until scroll',
    );
    assert.match(
      gutter,
      /no-scrollbar/,
      'Sync scroller must hide the native bar (custom thumb is the affordance)',
    );
    assert.doesNotMatch(
      gutter,
      /bg-surface-sunken/,
      'No sunken fill behind the bar (reads as empty bottom padding)',
    );
  });

  it('remeasures from the wide header row and collapses when content fits', () => {
    const hook = read('src/design-system/components/grid/useSyncedHorizontalScrollbar.ts');
    assert.match(
      hook,
      /data-grid-col-header/,
      'Must observe the wide header row under [data-grid-col-header], not only the viewport-wide band',
    );
    assert.match(
      hook,
      /contentMinWidthRem/,
      'contentMinWidthRem changes must re-run measure (port border box stays viewport-wide)',
    );
    assert.match(
      hook,
      /contentMinWidthPx/,
      'Live resized px floor must re-run measure after drag-resize commit',
    );
    assert.match(
      hook,
      /MutationObserver/,
      'Must watch [data-cf-grid] style for live --cf-col-* setProperty during drag',
    );
    assert.match(
      hook,
      /attributeFilter:\s*\[\s*['"]style['"]\s*\]/,
      'MutationObserver must filter on the style attribute only',
    );
    assert.match(
      hook,
      /gridTemplateColumns/,
      'Measure must floor width from resolved grid-template-columns px sum',
    );
    const grid = read('src/design-system/components/grid/LedgerGrid.tsx');
    assert.match(
      grid,
      /pointer-events-none h-0 opacity-0/,
      'Empty sunken track must collapse when !overflowX (fake bottom padding)',
    );
    assert.match(
      grid,
      /contentMinWidthPx/,
      'LedgerGrid must accept and publish live content-min px into the width var + sync hook',
    );
    const surface = read('src/design-system/components/grid/LedgerGridSurface.tsx');
    assert.match(
      surface,
      /gridContentMinWidthPx/,
      'Surface must compute live content-min px from visible columns + persisted widths',
    );
  });
});
