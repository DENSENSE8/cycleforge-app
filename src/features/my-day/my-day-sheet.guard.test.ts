/**
 * Today Sheets recipe — pin flush surface + host SoT (Unbox golden port).
 *
 * `MyDayWorkspace` mounts `WORKBENCH_SHEET_*` hosts and the registry host; it passes
 * `surface="sheet"` so the grid uses `TABLE_SURFACE_SHEET_CLASS` (no framed
 * gutters / rounded-xl island).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { MY_DAY_TABLE_DEFINITION } from '@/features/my-day/grid/my-day-table-definition';

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('My Day Sheets recipe', () => {
  it('MyDayWorkspace mounts the registry host on a sheet-surface definition', () => {
    assert.equal(MY_DAY_TABLE_DEFINITION.surface, 'sheet');
    // Strip block comments first — a docstring may legitimately mention
    // `surface="sheet"` while the mount no longer carries the literal.
    const src = stripBlockComments(read('src/features/my-day/MyDayWorkspace.tsx'));
    assert.match(
      src,
      /<NonlinearTableHost[\s\S]*?binding=\{MY_DAY_TABLE_BINDING\}/,
      'MyDayWorkspace must mount NonlinearTableHost with the My Day binding',
    );
    assert.doesNotMatch(src, /<LedgerGridSurface/, 'must not reach past the host to the engine');
    assert.doesNotMatch(src, /surface="(sheet|framed)"/, 'shell recipe belongs to the definition');
  });

  it('MyDayWorkspace uses WORKBENCH_SHEET hosts (not BODY/CHROME gutters)', () => {
    const src = read('src/features/my-day/MyDayWorkspace.tsx');
    assert.match(src, /WORKBENCH_SHEET_CHROME/);
    assert.match(src, /WORKBENCH_SHEET_HOST/);
    assert.doesNotMatch(
      src,
      /WORKBENCH_BODY_COLUMN/,
      'Today body must be the flush sheet host, not the padded framed body',
    );
    assert.doesNotMatch(
      src,
      /WORKBENCH_CHROME_COLUMN/,
      'Today chrome must use WORKBENCH_SHEET_CHROME — no side gutters beside the rail',
    );
  });

  it('Band 1 clears border-t under GlobalHeader (no double hairline)', () => {
    const src = read('src/features/my-day/MyDayWorkspace.tsx');
    const chromeStart = src.indexOf('<WorkbenchChromeHeader');
    assert.ok(chromeStart >= 0, 'WorkbenchChromeHeader must exist');
    const chromeEnd = src.indexOf('/>', chromeStart);
    const chromeBlock = src.slice(
      chromeStart,
      chromeEnd > 0 ? chromeEnd + 2 : chromeStart + 500,
    );
    assert.match(
      chromeBlock,
      /border-t-0/,
      'Band 1 must use border-t-0 — GlobalHeader already owns the top seam',
    );
  });

  it('find lives on Band 3 (WorkbenchTriageBand) — never Band 1', () => {
    const src = stripBlockComments(read('src/features/my-day/MyDayWorkspace.tsx'));
    const chromeIdx = src.indexOf('<WorkbenchChromeHeader');
    const triageIdx = src.indexOf('<WorkbenchTriageBand');
    assert.ok(chromeIdx >= 0, 'Band 1 WorkbenchChromeHeader must exist');
    assert.ok(triageIdx > chromeIdx, 'Band 3 WorkbenchTriageBand must follow Band 1');
    // Band 1 (chrome → triage) carries no search prop; find is on Band 3.
    assert.doesNotMatch(
      src.slice(chromeIdx, triageIdx),
      /\bsearch=/,
      'Band 1 (WorkbenchChromeHeader) must not carry a search prop',
    );
    assert.match(src.slice(triageIdx), /TechRailSearchBar/, 'find field lives inside the triage band');
  });
});
