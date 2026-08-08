/**
 * Workbench KPI Band 2 snap-collapse SoT — Unbox composes the shared primitives;
 * no page-local collapse twin.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Workbench KPI snap-collapse SoT', () => {
  it('exports WorkbenchKpiBand + toggle + surface ids from workbench-kpi-collapse', () => {
    const src = read('src/components/dashboard/workbench-kpi-collapse.tsx');
    assert.match(src, /export function WorkbenchKpiBand/);
    assert.match(src, /export function WorkbenchKpiCollapseToggle/);
    assert.match(src, /export const WORKBENCH_KPI_SURFACE/);
    assert.match(src, /unbox: 'unbox'/);
  });

  it('workbench-shell hosts triage kpiToggle for the KPI toggle (import SoT from kpi-collapse)', () => {
    const shell = read('src/components/dashboard/workbench-shell.tsx');
    // Consumers import KPI primitives from workbench-kpi-collapse (knip-reachable);
    // shell only documents the compose point + WorkbenchTriageBand.kpiToggle slot.
    assert.doesNotMatch(
      shell,
      /export \{[\s\S]*WorkbenchKpiBand/,
      'do not barrel-re-export KPI collapse from workbench-shell (knip marks dual exports dead)',
    );
    assert.doesNotMatch(
      shell,
      /WORKBENCH_TRIAGE_LEADING_CLASS/,
      'Select-gutter leading cell retired — search is flush left (Unbox History golden)',
    );
    const triageStart = shell.indexOf('export function WorkbenchTriageBand');
    const afterTriage = shell.indexOf('\nexport function', triageStart + 1);
    const triage = shell.slice(
      triageStart,
      afterTriage >= 0 ? afterTriage : shell.length,
    );
    assert.match(triage, /kpiToggle\?:/);
    assert.doesNotMatch(triage, /\bleading\?:/);
  });

  it('Unbox triage kpiToggle composes the SoT WorkbenchTriageBand.kpiToggle (no local twin)', () => {
    // KPI collapse lives on Band 3 for every Unbox sheet tab (incl. History) —
    // one door that stays on screen when the inspector rail is parked. Pinned
    // Inbound omits the whole triage band. View topics are layout-only.
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    assert.match(header, /<WorkbenchTriageBand/, 'Unbox composes the SoT WorkbenchTriageBand');
    assert.doesNotMatch(header, /function UnboxTriageBand/, 'the page-local triage twin is deleted');
    const triageIdx = header.indexOf('<WorkbenchTriageBand');
    assert.match(
      header.slice(triageIdx, triageIdx + 1000),
      /kpiToggle=\{/,
      'Unbox sheet tabs pass KPI collapse via the SoT kpiToggle slot',
    );
    assert.match(
      header.slice(triageIdx, triageIdx + 1000),
      /WorkbenchKpiCollapseToggle/,
      'Band 3 hosts WorkbenchKpiCollapseToggle (not View topics)',
    );
    assert.doesNotMatch(
      header.slice(triageIdx, triageIdx + 1000),
      /\bleading=\{/,
      'KPI toggle must not sit left of search (scanner flush-left)',
    );
    const viewCluster = read(
      'src/components/receiving/history/HistoryViewTopicsCluster.tsx',
    );
    assert.doesNotMatch(
      viewCluster,
      /WorkbenchKpiCollapseToggle/,
      'View topics stay layout-only — KPI collapse is Band 3',
    );
  });

  it('Unbox chrome imports KPI collapse from the SoT module', () => {
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    assert.match(header, /from '@\/components\/dashboard\/workbench-kpi-collapse'/);
  });

  it('staff_preferences carries kpiCollapsed map', () => {
    const schema = read('src/lib/schemas/staff-preferences.ts');
    assert.match(schema, /kpiCollapsed:/);
    const queries = read('src/lib/neon/staff-preferences-queries.ts');
    assert.match(queries, /kpiCollapsed\?:/);
  });

  it('Unbox chrome composes WorkbenchKpiBand + toggle (no raw Band 2 island)', () => {
    const header = read('src/components/receiving/unbox/UnboxWorkspaceHeader.tsx');
    assert.match(header, /WorkbenchKpiBand/);
    assert.match(header, /WorkbenchKpiCollapseToggle/);
    assert.match(header, /useWorkbenchKpiCollapsed/);
    assert.match(header, /WORKBENCH_KPI_SURFACE\.unbox/);
    assert.match(header, /kpiToggle=\{/);
    // Must not keep the pre-collapse bare Band 2 wrapper as the only mount.
    const kpiMount = header.indexOf('<WorkbenchKpiBand');
    assert.ok(kpiMount >= 0, 'Unbox must mount WorkbenchKpiBand');
    assert.match(
      header.slice(kpiMount, kpiMount + 400),
      /UnboxChromeKpiCluster/,
      'UnboxChromeKpiCluster stays the metrics SoT inside WorkbenchKpiBand',
    );
  });

  it('Unbox Band 2 is a compact Usage strip (no viz switch / gauge / LedgerGrid)', () => {
    const cluster = read('src/components/receiving/unbox/UnboxChromeKpiCluster.tsx');
    const canvas = read('src/components/receiving/unbox/UnboxKpiCanvas.tsx');
    assert.match(cluster, /UnboxKpiCanvas/);
    assert.match(cluster, /\/api\/receiving\/unbox-kpi/);
    assert.match(canvas, /data-testid="unbox-kpi-canvas"/);
    assert.match(canvas, /urange/);
    assert.match(canvas, /text-role-micro/);
    assert.match(canvas, /density="compact"/);
    assert.doesNotMatch(canvas, /KpiVizToggle/);
    assert.doesNotMatch(canvas, /from '@\/design-system\/components\/TabSwitch'/);
    assert.doesNotMatch(canvas, /<\s*TabSwitch[\s/>]/);
    assert.doesNotMatch(canvas, /GaugeDonut/);
    assert.doesNotMatch(canvas, /MultiSeriesLineChart/);
    assert.doesNotMatch(canvas, /min-h-\[12rem\]/);
    assert.doesNotMatch(canvas, /LedgerGrid/);
    assert.doesNotMatch(cluster, /LedgerGrid/);
    const routes = read('src/lib/routing/receiving-routes.ts');
    assert.match(routes, /urange:\s*paramEnum/);
    // Compact card owns hover date/value; spark is embedded (no twin readout).
    const card = read('src/design-system/components/monitor/KpiChartCard.tsx');
    assert.match(card, /variant=\{compact \? 'embedded' : 'default'\}/);
    assert.match(card, /onHoverAt=\{compact \? setHoverAt : undefined\}/);
    assert.match(card, /formatHoverBucketDate/);
  });

  it('hook merges the whole kpiCollapsed map on write', () => {
    const hook = read('src/hooks/useWorkbenchKpiCollapsed.ts');
    assert.match(hook, /\.\.\.\(prev\.kpiCollapsed \?\? \{\}\)/);
    assert.match(hook, /update\(\{ kpiCollapsed: nextMap \}\)/);
  });

  it('hook hydrates once — does not re-apply stored on every prefs write', () => {
    const hook = read('src/hooks/useWorkbenchKpiCollapsed.ts');
    assert.match(hook, /hydratedRef/);
    assert.match(
      hook,
      /if \(isLoading \|\| hydratedRef\.current\) return/,
      'must not sync local ← stored after first hydrate (flash / snap-back)',
    );
    assert.match(hook, /toggleCollapsed/, 'ref-stable toggle for Band 3 click');
  });

  it('staff-preferences onSuccess merges only patched keys', () => {
    const src = read('src/hooks/useStaffPreferences.ts');
    assert.match(src, /mergePatchedPrefs/);
    assert.match(
      src,
      /Object\.keys\(patch\)/,
      'full server replace clobbers concurrent kpiCollapsed optimism',
    );
  });

  it('KPI band keeps children mounted (height animate — no AnimatePresence unmount)', () => {
    const src = read('src/components/dashboard/workbench-kpi-collapse.tsx');
    assert.doesNotMatch(
      src,
      /AnimatePresence/,
      'unmounting KPI body on hide remount-flashes the metrics cluster',
    );
    assert.match(src, /framerPresence\.collapseHeight\.(animate|exit)/);
    assert.match(src, /\{children\}/);
  });
});
