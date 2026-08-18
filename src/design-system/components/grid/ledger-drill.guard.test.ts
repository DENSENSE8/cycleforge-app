/**
 * LedgerGrid parent→child drill SoT guard.
 *
 * Drill lives under `@/design-system/components/grid` — domain adapters
 * (receiving History, …) compose {@link LedgerDrillHost}; they must not own
 * a twin dual-pane resize/layout shell.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('LedgerDrill SoT (WMS-wide)', () => {
  it('exports LedgerDrillHost from the grid barrel', () => {
    const barrel = src('src/design-system/components/grid/index.ts');
    assert.match(barrel, /LedgerDrillHost/);
    assert.match(barrel, /LedgerDrillParentMap/);
    assert.match(barrel, /parseLedgerDrillLayout/);
  });

  it('LedgerDrillHost composes useHorizontalEdgeResize (no twin resize SoT)', () => {
    const host = src(
      'src/design-system/components/grid/LedgerDrillHost.tsx',
    );
    assert.match(host, /useHorizontalEdgeResize/);
    assert.match(host, /HorizontalEdgeResizeHandle/);
    assert.doesNotMatch(host, /useVerticalSplitDrag/);
    // Host is domain-agnostic — no receiving / unbox imports.
    assert.doesNotMatch(host, /@\/components\/(station|receiving)/);
    assert.doesNotMatch(host, /ReceivingPoGroup|drillPo|hlayout/);
  });

  it('ReceivingDrillHost is a thin adapter over LedgerDrillHost', () => {
    const adapter = src(
      'src/components/station/receiving-grid/ReceivingDrillHost.tsx',
    );
    assert.match(adapter, /LedgerDrillHost/);
    assert.match(adapter, /from '@\/design-system\/components\/grid'/);
    // Adapter must not re-implement the edge resize shell.
    assert.doesNotMatch(adapter, /useHorizontalEdgeResize/);
    // Parent-map find is the rail SoT — compose TechRailSearchBar; do not
    // invent a second filter band.
    assert.match(adapter, /TechRailSearchBar/);
    assert.match(adapter, /footer=/);
    // Filter trailing collapse shares Unboxed-recent Family-B grammar.
    assert.match(adapter, /RailFilterCollapseButton/);
    assert.match(adapter, /useLedgerDrillCollapse/);
    assert.match(adapter, /trailingAction=/);
  });

  it('LedgerDrillHost parks parent map via collapse preference + expand strip', () => {
    const host = src(
      'src/design-system/components/grid/LedgerDrillHost.tsx',
    );
    assert.match(host, /useLedgerDrillCollapse/);
    assert.match(host, /onCollapseBeyondMin/);
    assert.match(host, /LeftDockCollapseStrip/);
    assert.match(host, /ledger-drill-expand/);
    assert.match(host, /\.collapsed/);
    assert.doesNotMatch(host, /ChevronRight/);
  });

  it('left-dock toggle SoT is shared with the context rail', () => {
    const toggle = src('src/components/sidebar/tech/left-dock-toggle.tsx');
    assert.match(toggle, /ArrowRightToLine/);
    assert.match(toggle, /LEFT_DOCK_TOGGLE_ICON_CLASS/);
    assert.match(toggle, /LeftDockCollapseStrip/);
    assert.doesNotMatch(toggle, /ChevronRight/);
  });

  it('LedgerDrillParentMap seats an optional footer below the scrollport', () => {
    const map = src(
      'src/design-system/components/grid/LedgerDrillParentMap.tsx',
    );
    assert.match(map, /footer\?:/);
    assert.match(map, /footer != null/);
    // Same more-below lip as station recent rails — never a bare overflow twin.
    assert.match(map, /SidebarRailScrollport/);
    assert.doesNotMatch(map, /useMoreBelow/);
    assert.doesNotMatch(map, /SCROLL_MORE_BELOW_CLASS/);
    // Domain may host CopyChip in meta — rows must not be nested <button>.
    assert.doesNotMatch(map, /ds-raw-button/);
    assert.match(map, /role="button"/);
  });

  it('page-local dual-pane drill outside the grid SoT is banned for History', () => {
    const compareHost = src(
      'src/components/receiving/unbox/compare/UnboxCompareHost.tsx',
    );
    assert.doesNotMatch(
      compareHost,
      /LedgerDrillHost|ReceivingDrillHost|drillPo|hlayout/,
    );
  });
});
