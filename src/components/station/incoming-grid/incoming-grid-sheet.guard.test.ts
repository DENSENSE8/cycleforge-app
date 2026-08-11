/**
 * Incoming Sheets recipe — pin flush surface + host SoT (Unbox golden).
 *
 * `inbound.incoming` declares `surface: 'sheet'` so the Pipeline grid uses
 * `TABLE_SURFACE_SHEET_CLASS`; the Incoming grid (in ReceivingLinesTable) mounts it through
 * `NonlinearTableHost` (plan Phase 1). Hosts wire `WORKBENCH_SHEET_HOST` /
 * `WORKBENCH_SHEET_CHROME` — never framed `WorkbenchTablePane` or body gutters
 * around the grid.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { INCOMING_TABLE_DEFINITION } from '@/components/station/incoming-grid/incoming-table-definition';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Incoming grid Sheets recipe (Unbox golden)', () => {
  it('the inbound.incoming DEFINITION declares surface: "sheet"', () => {
    assert.equal(INCOMING_TABLE_DEFINITION.surface, 'sheet');
  });

  it('ReceivingLinesTable mounts the Incoming registry host, not the engine directly', () => {
    const src = read('src/components/station/ReceivingLinesTable.tsx');
    assert.match(
      src,
      /<NonlinearTableHost[\s\S]*?binding=\{INCOMING_TABLE_BINDING\}/,
      'The Incoming grid must mount NonlinearTableHost with the incoming binding',
    );
    assert.doesNotMatch(
      src,
      /<LedgerGridSurface/,
      'The page binding must not reach past the host to the engine',
    );
    assert.doesNotMatch(
      src,
      /surface="(sheet|framed)"/,
      'The shell recipe belongs to the definition, never to the mount',
    );
    assert.doesNotMatch(
      src,
      /TABLE_SURFACE_CLIP_CLASS/,
      'Incoming must not hand-compose the framed CLIP class — the surface owns it',
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
    assert.doesNotMatch(
      header,
      /IncomingKpiStrip|WorkbenchKpiBand/,
      'KPI Band 2 was deleted — no IncomingKpiStrip / WorkbenchKpiBand',
    );
    assert.doesNotMatch(
      header,
      /LANE_TABS|label: 'Pipeline'|label: 'Docked'/,
      'Pipeline|Docked big tabs were deleted — Band-1 is POS | Email',
    );
    assert.doesNotMatch(
      header,
      /Recently removed/,
      'Retired removed-lane facet must not reappear as a Band-1 label',
    );
    assert.doesNotMatch(
      header,
      /id: 'removed'/,
      'PIPELINE_VIEW_TABS must not include removed',
    );
    // Band 1 keeps labeled CTAs — not icon-only refine density.
    const actions = read(
      'src/components/sidebar/receiving/incoming/IncomingChromeActions.tsx',
    );
    assert.match(actions, /ChromeCheckButton/, 'Check CTA composes the shared chrome face');
    assert.match(actions, /Import/);
    assert.match(actions, />\s*Add\s*</);
    assert.doesNotMatch(
      actions,
      /ICON_PILL/,
      'Check/Import/Add must be labeled pills, not square icon-only',
    );
  });

  it('The Incoming grid wires clickSelect + selectGutterChrome', () => {
    const src = read('src/components/station/ReceivingLinesTable.tsx');
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
