/**
 * Pins Unbox History triage slide-over + click-plane contracts.
 *
 * Run: `tsx --test src/components/receiving/history/history-carton-triage.guard.test.ts`
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const panel = readFileSync(
  fileURLToPath(new URL('./HistoryCartonTriagePanel.tsx', import.meta.url)),
  'utf8',
);
const table = readFileSync(
  fileURLToPath(new URL('../../station/ReceivingLinesTable.tsx', import.meta.url)),
  'utf8',
);
const menu = readFileSync(
  fileURLToPath(
    new URL('../unbox/compare/ReceivingRowTriageContextMenu.tsx', import.meta.url),
  ),
  'utf8',
);
const occupancy = readFileSync(
  fileURLToPath(
    new URL('../../../lib/right-rail/receiving-selection-occupancy.ts', import.meta.url),
  ),
  'utf8',
);

describe('HistoryCartonTriagePanel', () => {
  test('registers detail:history via DetailStackRailRegistrar (non-modal push)', () => {
    assert.match(panel, /DetailStackRailRegistrar/);
    assert.match(panel, /HISTORY_TRIAGE_RAIL_ID\s*=\s*'detail:history'/);
    assert.match(panel, /modal=\{false\}/);
    // SoT: right edge pushes — never float over the History grid.
    assert.doesNotMatch(panel, /push=\{false\}/);
    assert.doesNotMatch(panel, /push:\s*false/);
    // Band 3 / Cmd+\ park via DETAIL_STACK_COLLAPSE — keep target mounted.
    assert.match(panel, /edgeCollapse/);
    assert.doesNotMatch(panel, /edgeCollapse=\{false\}/);
    // Band 3 owns the sole reopen icon — no parked 32px host rail.
    assert.match(panel, /collapsedStrip=\{false\}/);
  });

  test('composes Desk chrome + photos + facts', () => {
    assert.match(panel, /DeskRailChromeRow/);
    assert.match(panel, /ReceivingPhotosSection/);
    assert.match(panel, /OrderFactList/);
    assert.match(panel, /data-testid="history-carton-triage-panel"/);
  });

  test('header is chrome → View → identity → DeskInspectorIndexShell', () => {
    assert.match(panel, /DeskInspectorIndexShell/);
    assert.match(panel, /buildHistoryInspectorLeaves/);
    assert.doesNotMatch(panel, /PaneHeaderTabs/);
    assert.doesNotMatch(panel, /SectionTabsSlider/);
    assert.doesNotMatch(
      panel.replace(/\/\*[\s\S]*?\*\//g, ''),
      /StationDisplaysPushStack/,
    );
    assert.match(panel, /historyInspectorTopicActions/);
    assert.match(panel, /historyInspectorPrimaryAction/);
    assert.match(panel, /DeskRailChromeRow/);
    assert.match(panel, /HistoryViewTopicsCluster/);
    assert.match(panel, /viewOnly/);
    // Row 1 is deliberately sparse: close + ↑↓ only.
    const chromeJsx = panel.match(/<DeskRailChromeRow[\s\S]*?\/>/);
    assert.ok(chromeJsx, 'DeskRailChromeRow must be mounted');
    assert.doesNotMatch(
      chromeJsx[0]!,
      /\bactions=/,
      'top chrome row must contain only close + previous/next',
    );
    // View chrome + identity stay above the topic shell.
    const viewAt = panel.indexOf('data-testid="history-triage-view-chrome"');
    const identityAt = panel.indexOf('data-testid="history-triage-identity"');
    const shellAt = panel.indexOf('testId="history-inspector-index"');
    assert.ok(viewAt > 0, 'View chrome row must exist');
    assert.ok(identityAt > viewAt, 'identity must render below View chrome');
    assert.ok(shellAt > identityAt, 'topic shell must render below identity');
    assert.match(panel, /data-testid="history-triage-primary-cta"/);
    assert.match(panel, /data-testid="history-triage-view-toggle"/);
    assert.match(panel, /data-history-topic=/);
    // Edit icon ActionBar + scroll-spy IntersectionObserver are retired.
    assert.doesNotMatch(panel, /PaneHeaderActionBar/);
    assert.doesNotMatch(panel, /IntersectionObserver/);
    // Identity band is a slim key — the queue-redundant icon hero is gone and it
    // carries no CTA strip (those old labels never return).
    assert.doesNotMatch(panel, /PaneHeaderIconBadge/);
    assert.doesNotMatch(panel, />\s*Print barcode\s*</);
    assert.doesNotMatch(panel, />\s*Continue Unbox\s*</);
    assert.doesNotMatch(panel, />\s*Match PO\s*</);
    assert.doesNotMatch(panel, />\s*Full log\s*</);
    assert.doesNotMatch(panel, />\s*View listing\s*</);
    assert.doesNotMatch(panel, /variant="secondary"/);
  });

  test('record actions dock on the bottom InspectorActionFloor (n=1)', () => {
    // Editing gravity is the bottom dock — primary CTA (Print · Open in Unbox)
    // + More + flush trailing Delete, all BELOW the topic shell so a Park in the
    // top chrome never sits beside a Delete.
    assert.match(panel, /InspectorActionFloor/);
    assert.match(panel, /InspectorFlushDelete/);
    assert.match(panel, /data-testid="history-triage-delete"/);
    assert.match(panel, /data-testid="history-triage-more"/);
    const identityPos = panel.indexOf('data-testid="history-triage-identity"');
    const shellPos = panel.indexOf('testId="history-inspector-index"');
    const floorPos = panel.indexOf('<InspectorActionFloor');
    const primaryPos = panel.indexOf('data-testid="history-triage-primary-cta"');
    assert.ok(floorPos > shellPos, 'action floor must dock below the topic shell');
    assert.ok(
      primaryPos > shellPos && primaryPos > identityPos,
      'primary CTA moved off the identity band into the floor',
    );
  });
});

describe('History topics stay off the Unbox History sheet', () => {
  const header = readFileSync(
    fileURLToPath(new URL('../unbox/UnboxWorkspaceHeader.tsx', import.meta.url)),
    'utf8',
  );
  const view = readFileSync(
    fileURLToPath(new URL('../unbox/UnboxWorkspaceView.tsx', import.meta.url)),
    'utf8',
  );
  const viewCluster = readFileSync(
    fileURLToPath(new URL('./HistoryViewTopicsCluster.tsx', import.meta.url)),
    'utf8',
  );

  test('Band 3 owns find + park/reopen only — no topic ActionBar / sheet refine', () => {
    assert.match(header, /inspectorToggle/);
    assert.match(header, /unbox-history-inspector-toggle/);
    assert.doesNotMatch(header, /historyInspectorTopicActions/);
    assert.doesNotMatch(header, /history-triage-topic-actions/);
    assert.doesNotMatch(header, /data-history-topic/);
    assert.doesNotMatch(header, /HistoryDrillChrome/);
    assert.doesNotMatch(header, /HistoryRowPaintChrome/);
    const triageIdx = header.indexOf('<WorkbenchTriageBand');
    assert.ok(triageIdx >= 0);
    const triageBlock = header.slice(triageIdx, triageIdx + 1400);
    // Refine lives in-field (trailingSuffix) — no Band 3 `right=` refine twin.
    assert.doesNotMatch(
      triageBlock,
      /\bright=\{/,
      'History Band 3 must omit the refine right cluster',
    );
    assert.match(
      triageBlock,
      /trailing=\{inspectorToggle\}/,
      'Inspector toggle must sit in WorkbenchTriageBand.trailing',
    );
    // Sheet toggle is ColumnsTwo park — not Print / summary / logistics topics.
    assert.doesNotMatch(header, /Order \/ PO summary/);
    assert.doesNotMatch(header, /Print barcode \/ label/);
    // Browse view does not park History paint/drill on the header.
    assert.doesNotMatch(view, /historyDrillChrome/);
    assert.doesNotMatch(view, /HistoryRowPaintChrome/);
  });

  test('View topics compose layout chrome in the inspector cluster', () => {
    assert.match(viewCluster, /HistoryDrillChrome/);
    assert.match(viewCluster, /HistoryRowPaintChrome/);
    assert.match(viewCluster, /UnboxCompareChrome/);
    assert.doesNotMatch(
      viewCluster,
      /StaffFilterButton/,
      'Staff is a Band 3 Refine query facet — not View layout chrome',
    );
    assert.doesNotMatch(
      viewCluster,
      /WorkbenchKpiCollapseToggle/,
      'KPI collapse is Band 3 — View topics stay layout-only',
    );
    assert.match(viewCluster, /data-testid="history-triage-view-topics"/);
  });

  test('Band 3 Refine funnel owns staff · scope · week query facets', () => {
    assert.match(header, /label="Refine"/);
    assert.match(header, /HISTORY_REFINE_FACETS/);
    assert.match(header, /HISTORY_REFINE_SOURCE_OPTIONS/);
    assert.match(header, /HISTORY_REFINE_WEEK_OPTIONS/);
    assert.match(header, /isHistoryRefineFacetHot/);
    // Facet tablist lives on WorkbenchRefineFacetTabs (shared SoT) — not inlined.
    assert.match(header, /WorkbenchRefineFacetTabs/);
    assert.match(header, /setHistoryStaff/);
    assert.match(header, /setHistoryWeek/);
    assert.match(header, /isHistoryCommandFilterHot/);
  });

  test('Band 3 toggle uses inspector nouns — not Station Open displays', () => {
    assert.match(header, /WorkbenchInspectorToggle/);
    const inspectorToggle = readFileSync(
      fileURLToPath(
        new URL('../../dashboard/workbench-inspector-toggle.tsx', import.meta.url),
      ),
      'utf8',
    );
    assert.match(inspectorToggle, /Show inspector/);
    assert.match(inspectorToggle, /Hide inspector/);
    // View-only shell: toggle opens without a row — no "select a row" gate.
    assert.doesNotMatch(header, /Select a row to open the inspector/);
    assert.doesNotMatch(
      header,
      /Open displays|Hide displays/,
      'History Band 3 parks the Desk inspector; Station StationDisplaysEdgeToggle owns Displays copy',
    );
  });
});

describe('ReceivingLinesTable History click planes', () => {
  test('Unbox History left-click opens triage; not click-select', () => {
    assert.match(table, /isUnboxHistoryTriage/);
    assert.match(table, /openHistoryTriage/);
    assert.match(table, /dispatchReceivingOpenHistoryTriage/);
    // Must not re-enable History click-select golden.
    assert.doesNotMatch(table, /historyClickSelect\s*=\s*embedded\s*&&\s*isHistoryMode/);
    assert.doesNotMatch(table, /const historyClickSelect/);
  });

  test('double-click path opens LineEdit via dispatchSelectLine', () => {
    assert.match(table, /openHistoryWorkspace/);
    assert.match(table, /onOpenWorkspace=\{isUnboxHistoryTriage \? openHistoryWorkspace/);
  });

  test('Unbox History publishes record-cursor for ambient ↑↓ / Esc', () => {
    assert.match(table, /usePublishRecordCursor/);
    assert.match(table, /useRecordCursorKeyboard/);
    assert.match(table, /surfaceId:\s*'unbox-history-grid'/);
    assert.match(table, /enabled:\s*isUnboxHistoryTriage/);
  });
});

describe('History context menu', () => {
  test('History-gated column clusters', () => {
    assert.match(menu, /historyTriage/);
    assert.match(menu, /receiving-row-triage-menu-history/);
    assert.match(menu, /resolveReceivingColFromTarget/);
    assert.match(menu, /Filter grid by this tracking number/);
    assert.match(menu, /Resolve unmatched carton/);
  });
});

describe('occupancy id', () => {
  test('exports detail:history occupant', () => {
    assert.match(occupancy, /historyInspect:\s*'detail:history'/);
  });
});
