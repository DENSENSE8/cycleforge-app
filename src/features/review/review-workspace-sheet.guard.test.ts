/**
 * Review family Sheets flush chrome — pin Packing / Pairing / Catalog-link tables
 * to the Unbox recipe hosts.
 *
 * Band 1 tabs · (no KPI — honest absence) · Band 3 triage live in
 * `WORKBENCH_SHEET_CHROME`; the grid body is `WORKBENCH_SHEET_HOST`. Never
 * reintroduce `WORKBENCH_CHROME_COLUMN` / `WORKBENCH_BODY_COLUMN` /
 * `WORKBENCH_TABLE_VIEWPORT` framed islands / `WorkbenchTablePane`.
 *
 * SoT: source-of-truth.md → Sheets flush mount recipe;
 * display/workbench-ops-queue.md → Unbox / To-ship three-band flush chrome.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  CATALOG_LINK_TABLE_DEFINITION,
  IMPORT_EXCEPTION_TABLE_DEFINITION,
} from '@/features/review/catalog-link/grid/catalog-link-table-definition';

const ROOT = join(process.cwd());
const FILES = [
  'src/features/review/ReviewPackingTable.tsx',
  'src/features/review/pairing/ReviewPairingTable.tsx',
  'src/features/review/catalog-link/ReviewCatalogLinkTable.tsx',
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Review family Sheets flush chrome', () => {
  for (const rel of FILES) {
    describe(rel, () => {
      it('uses WORKBENCH_SHEET_* hosts (not guttered columns / framed viewport)', () => {
        const src = stripBlockComments(read(rel));
        assert.match(src, /WORKBENCH_SHEET_CHROME/);
        assert.match(src, /WORKBENCH_SHEET_HOST/);
        assert.doesNotMatch(src, /WORKBENCH_CHROME_COLUMN/);
        assert.doesNotMatch(src, /WORKBENCH_BODY_COLUMN/);
        assert.doesNotMatch(src, /WORKBENCH_GUTTERS/);
        assert.doesNotMatch(
          src,
          /WORKBENCH_TABLE_VIEWPORT/,
          'Review grid must mount flush — no bounded framed viewport island',
        );
        assert.doesNotMatch(src, /WorkbenchTablePane/);
      });

      it('find lives on Band 3 (WorkbenchTriageBand), never a body mb-4 island', () => {
        const src = stripBlockComments(read(rel));
        assert.match(src, /WorkbenchTriageBand/);
        assert.doesNotMatch(src, /\bmb-4\b/);
      });

      it('tab band passes Unbox flush face overrides', () => {
        const src = read(rel);
        const headerStart = src.indexOf('<WorkbenchChromeHeader');
        assert.ok(headerStart >= 0, 'WorkbenchChromeHeader must exist');
        const headerEnd = src.indexOf('/>', headerStart);
        const headerBlock = src.slice(headerStart, headerEnd > 0 ? headerEnd + 2 : headerStart + 800);
        assert.match(headerBlock, /border-l-0/);
        assert.match(headerBlock, /border-t-0/);
        assert.match(headerBlock, /rounded-none/);
      });
    });
  }

  it('both catalog-link definitions declare surface: "sheet" and mount the host', () => {
    // Two definitions, one shared bag (plan Phase 1, wave 4). The shell recipe
    // moved from a `surface="sheet"` mount literal to each definition; the file
    // now mounts NonlinearTableHost twice, once per binding.
    assert.equal(CATALOG_LINK_TABLE_DEFINITION.surface, 'sheet');
    assert.equal(IMPORT_EXCEPTION_TABLE_DEFINITION.surface, 'sheet');
    const src = read('src/features/review/catalog-link/grid/ReviewCatalogLinkGridView.tsx');
    const mounts = src.match(/<NonlinearTableHost[\s\S]*?binding=\{/g) ?? [];
    assert.equal(mounts.length, 2, 'both catalog-link grids must mount NonlinearTableHost');
    assert.doesNotMatch(src, /<LedgerGridSurface/, 'must not reach past the host to the engine');
  });
});
