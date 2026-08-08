/**
 * Testing ownership scope (My / All) — staff facet on queue tabs + twin contract.
 *
 * SoT: docs/todo/testing-triage-ownership-scope-HANDOFF.md (Option A).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Testing triage ownership scope', () => {
  it('normalizeTestingWorkspaceTabParams keeps ?staff= on queue tabs', () => {
    const src = read('src/utils/testing-workspace-state.ts');
    const fn = src.slice(src.indexOf('export function normalizeTestingWorkspaceTabParams'));
    // Must not delete staff when leaving history — ownership persists across tabs.
    assert.doesNotMatch(
      fn,
      /if \(nextTab !== 'history'\) \{[\s\S]*?params\.delete\('staff'\)/,
      'Staff scope must survive Pending↔Urgent↔Returns switches',
    );
  });

  it('TestingTriageBand renders StaffFilterButton on queue tabs (Option A = no allToken)', () => {
    const header = stripBlockComments(read('src/components/tech/testing/TestingWorkspaceHeader.tsx'));
    const triage = header.slice(header.indexOf('export function TestingTriageBand'));
    assert.match(triage, /StaffFilterButton/);
    // History keeps Me-default; queue uses plain All-default.
    assert.match(triage, /allToken=["']all["']/);
    assert.match(triage, /meLabel=["']You["']/);
    // Queue branch only for Pending · Urgent · Returns (not All).
    assert.match(triage, /showStaff/);
    // Find-only Band 3 — Refine rides in the field (density=field), not iconOnly.
    assert.match(triage, /StaffFilterButton[\s\S]*density=["']field["'][\s\S]*allLabel/);
  });

  it('body + KPI twin share testing-workspace-query helpers', () => {
    const list = stripBlockComments(read('src/components/tech/TestingHistoryList.tsx'));
    const kpi = stripBlockComments(read('src/components/tech/testing/TestingKpiStrip.tsx'));
    for (const src of [list, kpi]) {
      assert.match(src, /testingWorkspaceQueryKey/);
      assert.match(src, /buildTestingWorkspaceSearchParams/);
      assert.match(src, /resolveTestingWorkspaceTesterId/);
    }
  });

  it('Testing selection publishes Assign to me / Assign to…', () => {
    const src = stripBlockComments(read('src/components/tech/useTechTestingSelection.tsx'));
    assert.match(src, /Assign to me/);
    assert.match(src, /Assign to…/);
    assert.match(src, /assigned_tech_id/);
    assert.match(src, /invalidateQueries\(\{\s*queryKey:\s*\[['"]testing-workspace['"]\]/);
  });
});
