/**
 * Scan-out staged queue — Sheets flush host (Unbox recipe).
 *
 * Single-lane surface (no lifecycle tabs / KPI — the scan bar lives in the
 * sidebar), so the five-row stack degenerates to the flush data-table row: the
 * staged queue mounts in `WORKBENCH_SHEET_HOST`, never a framed
 * `WorkbenchTablePane` / `WORKBENCH_*_COLUMN` CLIP island.
 *
 * SoT: source-of-truth.md → Sheets flush mount recipe.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(process.cwd());
const VIEW = 'src/components/outbound/workspaces/ScanOutWorkspace.tsx';

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Scan-out staged queue Sheets flush host', () => {
  it('mounts the staged queue flush in WORKBENCH_SHEET_HOST (no CLIP island)', () => {
    const src = stripBlockComments(read(VIEW));
    assert.match(src, /WORKBENCH_SHEET_HOST/);
    assert.doesNotMatch(
      src,
      /WorkbenchTablePane/,
      'Scan-out staged queue must mount flush — no framed WorkbenchTablePane island',
    );
    assert.doesNotMatch(src, /WORKBENCH_CHROME_COLUMN/);
    assert.doesNotMatch(src, /WORKBENCH_BODY_COLUMN/);
    assert.doesNotMatch(src, /WORKBENCH_GUTTERS/);
  });
});
