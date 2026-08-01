/**
 * Source guard: Stations membership is Scan Stations / Desk via SoT `stationGroup`.
 * Pins — every APP station declares a group; Scan Stations stay pipeline-ordered
 * (Receiving subgroup + Testing / Packing / Scan out); Desk is Incoming + Review +
 * Support + Shipping. Spine renders Scan Stations/Desk as section drills via
 * SPINE_SECTIONS (no label twin). Receiving page-style header from STATION_SUBGROUPS.
 *
 * SoT: STATION_GROUPS + STATION_SUBGROUPS + SPINE_SECTIONS + APP_SIDEBAR_NAV /
 *      SIDEBAR_PAGE_NAV
 * Display law: .claude/rules/display/workbench.md (section drills)
 *
 * Run: node --test --import tsx \
 *        src/components/sidebar/master-nav/station-nav-groups.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  APP_SIDEBAR_NAV,
  SIDEBAR_PAGE_NAV,
  STATION_GROUPS,
  STATION_SUBGROUPS,
  type StationGroupId,
} from '@/lib/sidebar-navigation';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const FLOOR_PIPELINE = [
  'triage',
  'receive',
  'pickup',
  'repair',
  'tech',
  'packer',
  'scan-out',
] as const;
const DESK_IDS = ['incoming', 'review', 'support', 'outbound'] as const;
const RECEIVING_SUBGROUP = ['triage', 'receive', 'pickup', 'repair'] as const;
const ALLOWED: ReadonlySet<StationGroupId> = new Set(['floor', 'desk']);

const LIST_SRC = code(sourceOf('./SidebarNavList.tsx'));

test('STATION_GROUPS is Scan Stations then Desk', () => {
  assert.deepEqual(
    STATION_GROUPS.map((g) => g.id),
    ['floor', 'desk'],
  );
  assert.deepEqual(
    STATION_GROUPS.map((g) => g.label),
    ['Scan Stations', 'Desk'],
  );
});

test('every APP_SIDEBAR_NAV station declares stationGroup floor|desk', () => {
  const stations = APP_SIDEBAR_NAV.filter((item) => item.kind === 'station');
  assert.ok(stations.length >= 10, `expected ≥10 stations, got ${stations.length}`);
  for (const item of stations) {
    assert.equal(item.kind, 'station');
    assert.ok(
      ALLOWED.has(item.stationGroup),
      `${item.id} has invalid stationGroup ${String((item as { stationGroup?: string }).stationGroup)}`,
    );
  }
});

test('every SIDEBAR_PAGE_NAV station in APP declares matching stationGroup', () => {
  const byId = new Map(
    APP_SIDEBAR_NAV.filter((i) => i.kind === 'station').map((i) => [i.id, i]),
  );
  for (const page of SIDEBAR_PAGE_NAV) {
    if (page.kind !== 'station') continue;
    const flat = byId.get(page.id);
    // Legacy `receiving` family entry stays in SIDEBAR_PAGE_NAV for mode
    // resolution / deep-links but is not an APP L1 row.
    if (!flat) {
      assert.equal(page.id, 'receiving', `${page.id} missing from APP_SIDEBAR_NAV stations`);
      continue;
    }
    assert.equal(
      page.stationGroup,
      flat.stationGroup,
      `${page.id} stationGroup drift vs APP_SIDEBAR_NAV`,
    );
  }
});

test('Scan Stations appear in pipeline order in APP_SIDEBAR_NAV', () => {
  const floorIds = APP_SIDEBAR_NAV.filter(
    (item) => item.kind === 'station' && item.stationGroup === 'floor',
  ).map((item) => item.id);
  assert.deepEqual(floorIds, [...FLOOR_PIPELINE]);
});

test('Desk stations are incoming then review then support then Shipping in APP_SIDEBAR_NAV', () => {
  const deskIds = APP_SIDEBAR_NAV.filter(
    (item) => item.kind === 'station' && item.stationGroup === 'desk',
  ).map((item) => item.id);
  assert.deepEqual(deskIds, [...DESK_IDS]);
});

test('Receiving subgroup covers Arrival → Unbox → Local Pickup → Repair Service', () => {
  assert.deepEqual(
    STATION_SUBGROUPS.map((g) => g.id),
    ['receiving'],
  );
  assert.equal(STATION_SUBGROUPS[0]?.label, 'Receiving');
  assert.equal(typeof STATION_SUBGROUPS[0]?.icon, 'function');
  for (const id of RECEIVING_SUBGROUP) {
    const app = APP_SIDEBAR_NAV.find((i) => i.id === id);
    assert.ok(app && app.kind === 'station');
    assert.equal(app.stationSubgroup, 'receiving', `${id} missing stationSubgroup`);
    const page = SIDEBAR_PAGE_NAV.find((p) => p.id === id);
    assert.ok(page && page.kind === 'station');
    assert.equal(page.stationSubgroup, 'receiving', `${id} PAGE missing stationSubgroup`);
  }
  const repair = APP_SIDEBAR_NAV.find((i) => i.id === 'repair');
  assert.equal(repair?.label, 'Repair Service');
});

test('Scan out is floor modeless; Desk Shipping has Labels Ready FBA only', () => {
  const scanOut = APP_SIDEBAR_NAV.find((i) => i.id === 'scan-out');
  assert.ok(scanOut && scanOut.kind === 'station');
  assert.equal(scanOut.stationGroup, 'floor');
  assert.equal(getSidebarPageNavModes('scan-out'), undefined);

  const outbound = SIDEBAR_PAGE_NAV.find((p) => p.id === 'outbound');
  assert.ok(outbound && outbound.kind === 'station');
  assert.equal(outbound.stationGroup, 'desk');
  assert.deepEqual(
    outbound.modes?.map((m) => m.id),
    ['labels', 'ready', 'fba'],
  );
});

function getSidebarPageNavModes(id: string) {
  return SIDEBAR_PAGE_NAV.find((p) => p.id === id)?.modes;
}

test('SidebarNavList imports SPINE_SECTIONS and does not twin Scan Stations/Desk labels', () => {
  assert.match(LIST_SRC, /SPINE_SECTIONS/);
  assert.doesNotMatch(LIST_SRC, /['"]Scan Stations['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Floor['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Desk['"]/);
  assert.match(LIST_SRC, /role=["']group["']/);
});

test('Scan Stations/Desk are section drills — Receiving subgroup comes from SoT only', () => {
  // Free-form uppercase eyebrow twins remain banned; Receiving page-style header
  // reads STATION_SUBGROUPS (label + icon; no hardcoded "Receiving" string in list).
  assert.doesNotMatch(LIST_SRC, /text-role-micro uppercase tracking-widest text-text-faint/);
  assert.doesNotMatch(LIST_SRC, /text-role-eyebrow uppercase tracking-widest text-text-soft/);
  assert.doesNotMatch(LIST_SRC, /text-role-micro font-semibold text-text-faint/);
  assert.doesNotMatch(LIST_SRC, /['"]Receiving['"]/);
  assert.match(LIST_SRC, /STATION_SUBGROUPS/);
  assert.match(LIST_SRC, /stationSubgroup/);
  assert.match(LIST_SRC, /subgroupDef/);
  assert.match(LIST_SRC, /renderPageHeader/);
  assert.match(LIST_SRC, /ChevronRight/);
  assert.match(LIST_SRC, /onDrillChange/);
});

test('Section drills share one quiet list — no L1 hairline between nests', () => {
  assert.doesNotMatch(LIST_SRC, /groupIndex > 0 && 'mt-1\.5 border-t border-border-soft pt-1\.5'/);
  assert.match(LIST_SRC, /border-t border-border-soft/);
  assert.match(LIST_SRC, /border-b border-border-soft/);
});
