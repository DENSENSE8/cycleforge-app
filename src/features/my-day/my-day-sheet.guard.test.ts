/**
 * Today Sheets recipe — pin flush surface + host SoT (Unbox golden port).
 *
 * `MyDayWorkspace` mounts `WORKBENCH_SHEET_*` hosts; `MyDayGridView` passes
 * `surface="sheet"` so the grid uses `TABLE_SURFACE_SHEET_CLASS` (no framed
 * gutters / rounded-xl island).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('My Day Sheets recipe', () => {
  it('MyDayGridView mounts LedgerGridSurface with surface="sheet"', () => {
    const src = read('src/features/my-day/grid/MyDayGridView.tsx');
    assert.match(
      src,
      /<LedgerGridSurface[\s\S]*?surface="sheet"/,
      'MyDayGridView must pass surface="sheet" — flush Sheets mount',
    );
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
});
