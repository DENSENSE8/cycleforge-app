/**
 * Source guard: Stations L1 sub-taxonomy is Floor / Desk via SoT `stationGroup`.
 * Pins — every station declares a group; Floor stays pipeline-ordered; Desk is
 * Review + Support; SidebarNavList imports STATION_GROUPS (no label twin).
 *
 * SoT: STATION_GROUPS + APP_SIDEBAR_NAV / SIDEBAR_PAGE_NAV in sidebar-navigation.ts
 * Display law: .claude/rules/display/workbench.md (Stations Floor / Desk)
 * Plan: docs/todo/station-nav-floor-desk-PLAN.md
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
  type StationGroupId,
} from '@/lib/sidebar-navigation';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const FLOOR_PIPELINE = ['receiving', 'tech', 'packer', 'outbound'] as const;
const DESK_IDS = ['review', 'support'] as const;
const ALLOWED: ReadonlySet<StationGroupId> = new Set(['floor', 'desk']);

const LIST_SRC = code(sourceOf('./SidebarNavList.tsx'));

test('STATION_GROUPS is Floor then Desk', () => {
  assert.deepEqual(
    STATION_GROUPS.map((g) => g.id),
    ['floor', 'desk'],
  );
  assert.deepEqual(
    STATION_GROUPS.map((g) => g.label),
    ['Floor', 'Desk'],
  );
});

test('every APP_SIDEBAR_NAV station declares stationGroup floor|desk', () => {
  const stations = APP_SIDEBAR_NAV.filter((item) => item.kind === 'station');
  assert.ok(stations.length >= 6, `expected ≥6 stations, got ${stations.length}`);
  for (const item of stations) {
    assert.equal(item.kind, 'station');
    assert.ok(
      ALLOWED.has(item.stationGroup),
      `${item.id} has invalid stationGroup ${String((item as { stationGroup?: string }).stationGroup)}`,
    );
  }
});

test('every SIDEBAR_PAGE_NAV station declares matching stationGroup', () => {
  const byId = new Map(
    APP_SIDEBAR_NAV.filter((i) => i.kind === 'station').map((i) => [i.id, i]),
  );
  for (const page of SIDEBAR_PAGE_NAV) {
    if (page.kind !== 'station') continue;
    const flat = byId.get(page.id);
    assert.ok(flat, `${page.id} missing from APP_SIDEBAR_NAV stations`);
    assert.equal(
      page.stationGroup,
      flat!.stationGroup,
      `${page.id} stationGroup drift vs APP_SIDEBAR_NAV`,
    );
  }
});

test('Floor stations appear in pipeline order in APP_SIDEBAR_NAV', () => {
  const floorIds = APP_SIDEBAR_NAV.filter(
    (item) => item.kind === 'station' && item.stationGroup === 'floor',
  ).map((item) => item.id);
  assert.deepEqual(floorIds, [...FLOOR_PIPELINE]);
});

test('Desk stations are review then support in APP_SIDEBAR_NAV', () => {
  const deskIds = APP_SIDEBAR_NAV.filter(
    (item) => item.kind === 'station' && item.stationGroup === 'desk',
  ).map((item) => item.id);
  assert.deepEqual(deskIds, [...DESK_IDS]);
});

test('SidebarNavList imports STATION_GROUPS and does not twin Floor/Desk labels', () => {
  assert.match(LIST_SRC, /STATION_GROUPS/);
  assert.doesNotMatch(LIST_SRC, /['"]Floor['"]/);
  assert.doesNotMatch(LIST_SRC, /['"]Desk['"]/);
  assert.match(LIST_SRC, /role=["']group["']/);
  assert.match(LIST_SRC, /aria-labelledby/);
});

test('L1 parent eyebrows outrank Floor/Desk subtitles (type hierarchy)', () => {
  // Parent Main/Stations: role-eyebrow + text-text-soft (section header recipe).
  assert.match(LIST_SRC, /text-role-eyebrow uppercase tracking-widest text-text-soft/);
  // Nested Floor/Desk: quieter micro + faint — never peer-weight the parent.
  assert.match(LIST_SRC, /text-role-micro uppercase tracking-widest text-text-faint/);
});

test('L1 sections separate with a quiet hairline (Main / Stations / Stock)', () => {
  assert.match(LIST_SRC, /groupIndex > 0 && 'mt-1\.5 border-t border-border-soft pt-1\.5'/);
});
