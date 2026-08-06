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

  test('header is navigation → Display tabs → identity + one primary CTA', () => {
    assert.match(panel, /PaneHeaderTabs/);
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
    // Row 2 owns labelled Display tabs + View toggle; row 3 owns identity + CTA.
    const topicsAt = panel.indexOf('data-testid="history-triage-topic-tabs"');
    const identityAt = panel.indexOf('data-testid="history-triage-identity"');
    assert.ok(topicsAt > 0, 'contextual topic row must exist');
    assert.ok(identityAt > topicsAt, 'identity must render below the topic row');
    assert.match(panel, /data-testid="history-triage-primary-cta"/);
    assert.match(panel, /data-testid="history-triage-view-toggle"/);
    assert.match(panel, /data-history-topic=/);
    // Edit icon ActionBar + scroll-spy IntersectionObserver are retired.
    assert.doesNotMatch(panel, /PaneHeaderActionBar/);
    assert.doesNotMatch(panel, /IntersectionObserver/);
    // Multi-button labelled strip banned — one readiness CTA is allowed.
    assert.doesNotMatch(panel, />\s*Print barcode\s*</);
    assert.doesNotMatch(panel, />\s*Continue Unbox\s*</);
    assert.doesNotMatch(panel, />\s*Match PO\s*</);
    assert.doesNotMatch(panel, />\s*Full log\s*</);
    assert.doesNotMatch(panel, />\s*View listing\s*</);
    assert.doesNotMatch(panel, /variant="secondary"/);
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
    assert.match(header, /historyInspectorToggle/);
    assert.match(header, /unbox-history-inspector-toggle/);
    assert.doesNotMatch(header, /historyInspectorTopicActions/);
    assert.doesNotMatch(header, /history-triage-topic-actions/);
    assert.doesNotMatch(header, /data-history-topic/);
    assert.doesNotMatch(header, /HistoryDrillChrome/);
    assert.doesNotMatch(header, /HistoryRowPaintChrome/);
    // History path must not mount Band 3 kpiToggle / refine right / controls portal.
    assert.match(header, /isHistoryTab \? undefined/);
    const triageIdx = header.indexOf('<WorkbenchTriageBand');
    assert.ok(triageIdx >= 0);
    const triageBlock = header.slice(triageIdx, triageIdx + 1400);
    assert.match(
      triageBlock,
      /right=\{\s*isHistoryTab \? undefined/,
      'History Band 3 must omit the refine right cluster',
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
    assert.match(viewCluster, /WorkbenchKpiCollapseToggle/);
    assert.match(viewCluster, /data-testid="history-triage-view-topics"/);
  });

  test('Band 3 Refine funnel owns staff · scope · week query facets', () => {
    assert.match(header, /label="Refine"/);
    assert.match(header, /HISTORY_REFINE_FACETS/);
    assert.match(header, /HISTORY_REFINE_SOURCE_OPTIONS/);
    assert.match(header, /HISTORY_REFINE_WEEK_OPTIONS/);
    assert.match(header, /isHistoryRefineFacetHot/);
    assert.match(header, /role="tablist"/);
    assert.match(header, /setHistoryStaff/);
    assert.match(header, /setHistoryWeek/);
    assert.match(header, /isHistoryCommandFilterHot/);
  });

  test('Band 3 toggle uses inspector nouns — not Station Open displays', () => {
    assert.match(header, /Show inspector/);
    assert.match(header, /Hide inspector/);
    // View-only shell: toggle opens without a row — no "select a row" gate.
    assert.doesNotMatch(header, /Select a row to open the inspector/);
    assert.doesNotMatch(
      header,
      /Open displays|Hide right panel/,
      'History Band 3 parks the Desk inspector; Station UnboxDisplaysEdgeToggle owns Displays copy',
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
    assert.match(menu, /Resolve Unfound PO/);
  });
});

describe('occupancy id', () => {
  test('exports detail:history occupant', () => {
    assert.match(occupancy, /historyInspect:\s*'detail:history'/);
  });
});
