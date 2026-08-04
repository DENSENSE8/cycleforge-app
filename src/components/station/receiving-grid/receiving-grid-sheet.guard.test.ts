/**
 * Receiving golden Sheets recipe — pin flush surface + host SoT.
 *
 * `ReceivingGridView` mounts `LedgerGridSurface` with `surface="sheet"` so the
 * Unbox / History browse grid uses `TABLE_SURFACE_SHEET_CLASS` (no rounded-xl
 * island, no raised lift). Hosts wire `WORKBENCH_SHEET_HOST` — never raw `p-0`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { TABLE_SURFACE_SHEET_CLASS } from '@/design-system/tokens/table-surface';

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Receiving grid Sheets recipe', () => {
  it('ReceivingGridView mounts LedgerGridSurface with surface="sheet"', () => {
    const src = read('src/components/station/receiving-grid/ReceivingGridView.tsx');
    assert.match(
      src,
      /<LedgerGridSurface[\s\S]*?surface="sheet"/,
      'ReceivingGridView must pass surface="sheet" — the golden Sheets mount',
    );
    assert.doesNotMatch(
      src,
      /TABLE_SURFACE_CLIP_CLASS/,
      'Receiving must not hand-compose the framed CLIP class — surface prop owns it',
    );
  });

  it('LedgerGridSurface sheet branch uses TABLE_SURFACE_SHEET_CLASS', () => {
    const src = read('src/design-system/components/grid/LedgerGridSurface.tsx');
    assert.match(src, /TABLE_SURFACE_SHEET_CLASS/);
    assert.match(
      src,
      /surface === 'sheet' \? TABLE_SURFACE_SHEET_CLASS : TABLE_SURFACE_CLIP_CLASS/,
    );
  });

  it('sheet token has no rounded-xl / raised lift', () => {
    assert.doesNotMatch(TABLE_SURFACE_SHEET_CLASS, /\brounded-xl\b/);
    assert.doesNotMatch(TABLE_SURFACE_SHEET_CLASS, /\bshadow-elev/);
  });

  it('Unbox / History hosts use WORKBENCH_SHEET_HOST (not BODY gutters around the grid)', () => {
    const unbox = read('src/components/receiving/unbox/UnboxWorkspaceView.tsx');
    assert.match(unbox, /WORKBENCH_SHEET_HOST/);
    assert.match(unbox, /WORKBENCH_SHEET_CHROME/);
    assert.doesNotMatch(
      unbox,
      /WORKBENCH_BODY_COLUMN/,
      'Unbox browse body must be the flush sheet host, not the padded framed body',
    );
    assert.doesNotMatch(
      unbox,
      /WORKBENCH_CHROME_COLUMN/,
      'Unbox chrome must use WORKBENCH_SHEET_CHROME — no side gutters beside the rail',
    );

    const table = read('src/components/station/ReceivingLinesTable.tsx');
    assert.match(table, /WORKBENCH_SHEET_HOST/);
    // Standalone History branch hosts the grid on the sheet host, not the
    // framed WorkbenchTablePane card island.
    const historyIdx = table.indexOf('if (isHistoryMode)');
    assert.ok(historyIdx >= 0, 'History branch must exist');
    const historyBlock = table.slice(historyIdx, historyIdx + 900);
    assert.match(historyBlock, /WORKBENCH_SHEET_HOST/);
    assert.doesNotMatch(historyBlock, /WorkbenchTablePane/);
  });

  it('Unbox triage does not stack a bottom border against the sheet top', () => {
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    const triageStart = header.indexOf('function UnboxTriageBand');
    assert.ok(triageStart >= 0);
    const triageEnd = header.indexOf('\nconst TABS:', triageStart);
    const triageBlock = header.slice(triageStart, triageEnd > 0 ? triageEnd : triageStart + 600);
    assert.doesNotMatch(triageBlock, /\bborder-y\b/);
    assert.doesNotMatch(triageBlock, /\bborder-b\b/);
    assert.doesNotMatch(triageBlock, /\bborder-t\b/);
    assert.match(triageBlock, /\bborder-r\b/);
  });

  it('Unbox Band 1 clears border-t under GlobalHeader (no double hairline)', () => {
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    const chromeStart = header.indexOf('<WorkbenchChromeHeader');
    assert.ok(chromeStart >= 0, 'WorkbenchChromeHeader must exist');
    const chromeEnd = header.indexOf('/>', chromeStart);
    const chromeBlock = header.slice(
      chromeStart,
      chromeEnd > 0 ? chromeEnd + 2 : chromeStart + 400,
    );
    assert.match(
      chromeBlock,
      /border-t-0/,
      'Band 1 must use border-t-0 — GlobalHeader already owns the top seam',
    );
    const skeleton = read('src/components/receiving/unbox/UnboxWorkbenchSkeleton.tsx');
    assert.doesNotMatch(
      skeleton,
      /border-y/,
      'Skeleton Band 1 must not use border-y (would restack under GlobalHeader)',
    );
    assert.match(skeleton, /border-b border-r/);
  });

  it('LedgerGridColumnHeader is h-10 to match Unbox chrome bands', () => {
    const src = read('src/design-system/components/grid/LedgerGridColumnHeader.tsx');
    assert.doesNotMatch(src, /\bmin-h-11\b/);
    assert.match(src, /group\/hrow grid h-10 min-h-10/);
    // Select gutter stays h-10 when present; paint track also h-10.
    assert.match(src, /'h-10 min-h-10'/);
    assert.match(src, /emptyGutter \? 'items-stretch p-0' : 'justify-center'/);
    assert.match(src, /group\/hcell relative gap-1 h-10 min-h-10/);
  });

  it('Receiving leaf + summary rows are h-10 to match the column header band', () => {
    const row = read('src/components/station/receiving-grid/ReceivingGridRow.tsx');
    const summary = read(
      'src/components/station/receiving-grid/ReceivingGridGroupSummary.tsx',
    );
    assert.match(
      row,
      /'h-10 min-h-10'/,
      'ReceivingGridRow must share the header band height (h-10)',
    );
    assert.match(
      summary,
      /h-10 min-h-10/,
      'ReceivingGridGroupSummary must share the header band height (h-10)',
    );
  });

  it('LedgerGrid scroll ports hard-stop (overscroll-*-none)', () => {
    const src = read('src/design-system/components/grid/LedgerGrid.tsx');
    assert.match(
      src,
      /overflow-y-auto/,
      'Self-scroll Y must be overflow-y-auto',
    );
    assert.match(
      src,
      /overscroll-y-none/,
      'Self-scroll Y must kill macOS rubber-band on sticky column header',
    );
    assert.match(
      src,
      /overflow-x-auto/,
      'Self-scroll scrollX must be overflow-x-auto',
    );
    assert.match(
      src,
      /overscroll-x-none/,
      'Self-scroll scrollX must kill macOS rubber-band on sticky select/header',
    );
    assert.match(
      src,
      /overflow-x-auto overflow-y-clip overscroll-x-none/,
      'Split-x body scroller must also hard-stop at the edges',
    );
    assert.match(
      src,
      /GridStickyXScrollbar/,
      'scrollX surfaces must mount the sticky bottom X triage gutter',
    );
  });
});
