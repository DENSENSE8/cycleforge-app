/**
 * Receiving History drill SoT guard — fold vs drill vs compare must stay
 * distinct; History composes the WMS-wide {@link LedgerDrillHost} via a thin
 * receiving adapter.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Receiving History drill (adapter)', () => {
  it('ReceivingLinesTable mounts ReceivingDrillHost for History drill', () => {
    const table = src('src/components/station/ReceivingLinesTable.tsx');
    assert.match(table, /ReceivingDrillHost/);
    assert.match(table, /parseHistoryDrillLayout/);
    assert.match(table, /historyDrill/);
  });

  it('ReceivingDrillHost composes LedgerDrillHost (no local resize twin)', () => {
    const host = src(
      'src/components/station/receiving-grid/ReceivingDrillHost.tsx',
    );
    assert.match(host, /LedgerDrillHost/);
    assert.match(host, /LedgerDrillParentMap/);
    assert.match(host, /cf\.receivingDrill\.splitRatio/);
    assert.match(host, /TechRailSearchBar/);
    assert.doesNotMatch(host, /useHorizontalEdgeResize/);
  });

  it('History chrome omits triage search when drill (find lives on parent map)', () => {
    const header = src(
      'src/components/receiving/unbox/UnboxWorkspaceHeader.tsx',
    );
    assert.match(header, /parseHistoryDrillLayout/);
    assert.match(header, /historyFindInParentMap/);
  });

  it('history-drill-layout binds the generic URL contract', () => {
    const layout = src('src/lib/receiving/history-drill-layout.ts');
    assert.match(layout, /parseLedgerDrillLayout/);
    assert.match(layout, /writeLedgerDrillParams/);
    assert.match(layout, /LedgerDrillUrlContract/);
    assert.match(layout, /flattenSectionedParents/);
  });

  it('Unbox History chrome exposes Drill|List orthogonal to compare', () => {
    const view = src('src/components/receiving/unbox/UnboxWorkspaceView.tsx');
    // Drill|List + paint + compare + zoom ALL live on the inspector View
    // cluster now (2026-08-08) — Band 3 is find + KPI + inspector, so the view
    // only reads the chrome CONTEXT; it no longer mounts UnboxCompareChrome.
    assert.match(view, /HistoryViewTopicsCluster|history-view-chrome/);
    assert.doesNotMatch(
      view,
      /<UnboxCompareChrome/,
      'compare/zoom chrome belongs to the inspector View cluster, not the Unbox view',
    );
    const topics = src(
      'src/components/receiving/history/HistoryViewTopicsCluster.tsx',
    );
    assert.match(topics, /HistoryDrillChrome/);
    assert.match(topics, /UnboxCompareChrome/);
    const chrome = src('src/components/receiving/unbox/HistoryDrillChrome.tsx');
    assert.match(chrome, /hlayout|HISTORY_DRILL_LAYOUT_PARAM/);
  });

  it('page-local dual split outside the drill SoT is banned for History body', () => {
    const compareHost = src(
      'src/components/receiving/unbox/compare/UnboxCompareHost.tsx',
    );
    assert.doesNotMatch(
      compareHost,
      /ReceivingDrillHost|LedgerDrillHost|drillPo|hlayout/,
    );
  });
});
