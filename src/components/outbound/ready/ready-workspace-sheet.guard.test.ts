/**
 * Ready-stage Sheets recipe — the FBA `?fbaMode=ready` lane.
 *
 * `ReadyGridView` pins `surface="sheet"`; the disposition KPI tiles are pinned
 * in chrome (Band 2, `ReadyKpiBand`) — never a scrolling body `mb-4` island.
 *
 * SoT: source-of-truth.md → Sheets flush mount recipe;
 * display/workbench-ops-queue.md → Ready body KPI fold.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Ready Sheets recipe', () => {
  it('ReadyGridView pins surface="sheet" (never the framed CLIP default)', () => {
    const src = read('src/components/outbound/ready/grid/ReadyGridView.tsx');
    assert.match(
      src,
      /<LedgerGridSurface[\s\S]*?surface="sheet"/,
      'ReadyGridView must pass surface="sheet"',
    );
  });

  it('ReadyWorkspaceBody parks NO KPI island in the scrolling body', () => {
    const src = stripBlockComments(read('src/components/outbound/ready/ReadyWorkspaceBody.tsx'));
    assert.doesNotMatch(
      src,
      /\bmb-4\b/,
      'the body must not carry an mb-4 KPI island (folded into Band 2 chrome)',
    );
    assert.doesNotMatch(
      src,
      /ReadyKpiStrip/,
      'the KPI strip lives in ReadyKpiBand (Band 2 chrome), not the body',
    );
  });

  it('FBA pins the Ready KPI in Band 2 chrome (ReadyKpiBand), above the sheet host', () => {
    const src = read('src/components/fba/FbaOutboundWorkspace.tsx');
    const usageIdx = src.indexOf('<ReadyKpiBand');
    const bodyHostIdx = src.indexOf('className={WORKBENCH_SHEET_HOST}');
    assert.ok(usageIdx >= 0, 'Ready KPI must mount as <ReadyKpiBand> in the FBA chrome');
    assert.ok(bodyHostIdx >= 0, 'FBA body must be the flush sheet host');
    assert.ok(
      usageIdx < bodyHostIdx,
      'ReadyKpiBand renders in the pinned chrome (Band 2), above the scroll body',
    );
  });

  it('ReadyKpiBand shares the ready-history query key (dedupes with the body)', () => {
    const band = read('src/components/outbound/ready/ReadyKpiBand.tsx');
    const body = read('src/components/outbound/ready/ReadyWorkspaceBody.tsx');
    assert.match(band, /readyHistoryQueryKey/);
    assert.match(body, /readyHistoryQueryKey/);
  });
});
