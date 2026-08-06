/**
 * Incoming Sheets recipe — pin flush surface + host SoT (Unbox golden).
 *
 * `IncomingGridView` mounts `LedgerGridSurface` with `surface="sheet"` so the
 * Pipeline grid uses `TABLE_SURFACE_SHEET_CLASS`. Hosts wire
 * `WORKBENCH_SHEET_HOST` / `WORKBENCH_SHEET_CHROME` — never framed
 * `WorkbenchTablePane` or body gutters around the grid.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Incoming grid Sheets recipe (Unbox golden)', () => {
  it('IncomingGridView mounts LedgerGridSurface with surface="sheet"', () => {
    const src = read('src/components/station/incoming-grid/IncomingGridView.tsx');
    assert.match(
      src,
      /<LedgerGridSurface[\s\S]*?surface="sheet"/,
      'IncomingGridView must pass surface="sheet" — Unbox Sheets golden',
    );
    assert.doesNotMatch(
      src,
      /TABLE_SURFACE_CLIP_CLASS/,
      'Incoming must not hand-compose the framed CLIP class — surface prop owns it',
    );
  });

  it('Incoming Pipeline host uses WORKBENCH_SHEET_HOST (not WorkbenchTablePane)', () => {
    const table = read('src/components/station/ReceivingLinesTable.tsx');
    const inboundIdx = table.indexOf('if (isIncomingMode || isInboundDocked)');
    assert.ok(inboundIdx >= 0, 'Inbound desk branch must exist');
    const inboundBlock = table.slice(inboundIdx, inboundIdx + 2500);
    assert.match(inboundBlock, /WORKBENCH_SHEET_HOST/);
    assert.match(inboundBlock, /WORKBENCH_SHEET_CHROME/);
    assert.doesNotMatch(
      inboundBlock,
      /WorkbenchTablePane/,
      'Incoming Pipeline must not mount the framed WorkbenchTablePane card island',
    );
    assert.doesNotMatch(
      inboundBlock,
      /WORKBENCH_CHROME_COLUMN/,
      'Inbound chrome must use WORKBENCH_SHEET_CHROME — no side gutters beside the rail',
    );
    assert.doesNotMatch(
      inboundBlock,
      /WORKBENCH_GUTTERS/,
      'Inbound KPI band must not use WORKBENCH_GUTTERS — flush sheet chrome',
    );
  });

  it('IncomingWorkspaceHeader facet strip is rail-abutting (no side gutters)', () => {
    const header = read(
      'src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx',
    );
    assert.doesNotMatch(
      header,
      /WORKBENCH_GUTTERS/,
      'Facet strip must be rail-abutting — no WORKBENCH_GUTTERS class or import',
    );
    assert.match(
      header,
      /border-t-0/,
      'Band 1 must use border-t-0 — GlobalHeader already owns the top seam',
    );
    assert.match(
      header,
      /IncomingSourceFilters/,
      'Pipeline purchasing source must live in the Band-3 search-field filter',
    );
    assert.doesNotMatch(
      header,
      /label: 'Zoho'[\s\S]*label: 'eBay'|label: 'All'[\s\S]*label: 'Zoho'/,
      'Pipeline must not keep an All / Zoho / eBay TabSwitch facet strip',
    );
  });

  it('IncomingWorkspaceHeader mounts WorkbenchTriageBand (Band 3 Unbox SoT)', () => {
    const header = read(
      'src/components/sidebar/receiving/incoming/IncomingWorkspaceHeader.tsx',
    );
    assert.match(header, /WorkbenchTriageBand/);
    assert.match(
      header,
      /IncomingKpiStrip/,
      'KPI lives in IncomingWorkspaceHeader Band 2 (Unbox parity)',
    );
    // Band 1 keeps labeled CTAs — not icon-only refine density.
    const actions = read(
      'src/components/sidebar/receiving/incoming/IncomingChromeActions.tsx',
    );
    assert.match(actions, />\s*Check\s*</);
    assert.match(actions, /Import/);
    assert.match(actions, />\s*Add\s*</);
    assert.doesNotMatch(
      actions,
      /ICON_PILL/,
      'Check/Import/Add must be labeled pills, not square icon-only',
    );
  });

  it('IncomingGridView wires clickSelect + selectGutterChrome', () => {
    const src = read('src/components/station/incoming-grid/IncomingGridView.tsx');
    assert.match(src, /clickSelect/);
    assert.match(src, /selectGutterChrome/);
    const table = read('src/components/station/ReceivingLinesTable.tsx');
    assert.match(table, /incomingClickSelect/);
    assert.match(table, /clickSelect=\{incomingClickSelect\}/);
  });

  it('Incoming leaf rows are flat — no PO title summary fold (Sheets golden)', () => {
    assert.doesNotMatch(
      read('src/components/station/incoming-grid/IncomingGridGroupRow.tsx'),
      /IncomingGridGroupSummary|CollapsibleGroupRow/,
      'IncomingGridGroupRow must render flat leaves — no PO title summary fold',
    );
  });
});
