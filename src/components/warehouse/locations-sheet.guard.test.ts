/**
 * Source guard: Inventory › Locations browse uses Receiving Sheets flush
 * chrome (WORKBENCH_SHEET_* + surface="sheet") — no framed gutters / mb-4 KPI.
 *
 * Run: node --test --import tsx \
 *        src/components/warehouse/locations-sheet.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { BINS_TABLE_DEFINITION } from '@/components/warehouse/bins-grid/bins-table-definition';

const ROOT = process.cwd();

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('Locations Sheets flush mount', () => {
  const workspace = code(src('src/components/warehouse/LocationsWorkspace.tsx'));

  it('uses WORKBENCH_SHEET_CHROME + HOST (not BODY/CHROME gutters)', () => {
    assert.match(workspace, /WORKBENCH_SHEET_CHROME/);
    assert.match(workspace, /WORKBENCH_SHEET_HOST/);
    assert.doesNotMatch(workspace, /WORKBENCH_BODY_COLUMN/);
    assert.doesNotMatch(workspace, /WORKBENCH_CHROME_COLUMN/);
  });

  it('Bins grid mounts on a sheet-surface definition', () => {
    // The shell recipe moved from a `surface="sheet"` prop on the <BinsTable>
    // mount to the `warehouse.bins` definition (plan Phase 1, wave 3) — the dead
    // `'framed'` path was removed with the override chain.
    assert.equal(BINS_TABLE_DEFINITION.surface, 'sheet');
    assert.doesNotMatch(
      workspace,
      /surface=/,
      'LocationsWorkspace must not pass a surface prop — the definition owns it',
    );
  });

  it('does not park KPI in a guttered mb-4 body island', () => {
    assert.doesNotMatch(workspace, /className=["'][^"']*mb-4/);
    assert.match(workspace, /LocationsBinsKpiBand/);
    // Band 3 composes the SoT WorkbenchTriageBand — the page-local twin is deleted.
    assert.match(workspace, /WorkbenchTriageBand/);
    assert.doesNotMatch(workspace, /LocationsTriageBand/);
  });

  it('Band 1 clears border-t under GlobalHeader (no double hairline)', () => {
    const header = src('src/components/warehouse/LocationsWorkspaceHeader.tsx');
    assert.match(
      header,
      /border-t-0/,
      'Locations Band 1 must use border-t-0 — GlobalHeader already owns the top seam',
    );
    assert.match(header, /border-l-0/);
    assert.match(header, /rounded-none/);
  });
});
