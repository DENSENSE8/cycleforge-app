/**
 * Ready-stage Sheets recipe — the FBA `?fbaMode=ready` lane.
 *
 * `ReadyQueueTable` pins `surface="sheet"`; the disposition KPI tiles are pinned
 * in chrome (Band 2, `ReadyKpiBand`) — never a scrolling body `mb-4` island.
 *
 * SoT: source-of-truth.md → Sheets flush mount recipe;
 * display/workbench-ops-queue.md → Ready body KPI fold.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { READY_TABLE_DEFINITION } from '@/components/outbound/ready/grid/ready-table-definition';

const ROOT = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Ready Sheets recipe', () => {
  it('ReadyQueueTable mounts the registry host on a sheet-surface definition', () => {
    assert.equal(READY_TABLE_DEFINITION.surface, 'sheet');
    const src = read('src/components/outbound/ready/ReadyQueueTable.tsx');
    assert.match(
      src,
      /<NonlinearTableHost[\s\S]*?binding=\{READY_TABLE_BINDING\}/,
      'ReadyQueueTable must mount NonlinearTableHost with the Ready binding',
    );
    assert.doesNotMatch(src, /<LedgerGridSurface/, 'must not reach past the host to the engine');
    assert.doesNotMatch(src, /surface="(sheet|framed)"/, 'shell recipe belongs to the definition');
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
    // FBA composes WorkbenchSheetView (2d): the KPI rides the `band2` slot —
    // `band2`, not `kpi`, because this strip is mode-scoped and must NOT
    // snap-collapse. The shell renders band2 in the chrome stack and `children`
    // in the sheet host, so preceding the body render-prop IS "above the body".
    const bodyHostIdx = src.indexOf('{() => (');
    assert.ok(usageIdx >= 0, 'Ready KPI must mount as <ReadyKpiBand> in the FBA chrome');
    assert.ok(src.includes('band2='), 'FBA Band 2 must be the raw strip slot, not the KPI slot');
    assert.ok(bodyHostIdx >= 0, 'FBA body must be the shell children render-prop');
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
