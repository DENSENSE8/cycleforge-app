/**
 * The hard gate for the MOBILE-FIRST law (operator 2026-09-14):
 * The hard gate for the MOBILE-FIRST law (operator 2026-09-14): *"everything
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESK_SPINE_SECTIONS,
  APP_SIDEBAR_NAV,
  getSidebarNavItems,
  spineSectionIdForPage,
} from '@/lib/sidebar-navigation';
import { buildCommandBarNavGroups } from './command-bar-nav-groups';
import { LANE_MOBILE_FIRST, isLaneVisible } from './lanes';
import { migrateSpineSlots, resolveSpineMapEntries } from './spine-slots';

// Read from the ledger everywhere EXCEPT this constant, which names the set for readable failure messages.
const HIDDEN_LANE_IDS = ['monitor', 'support'] as const;

/** The registry row behind a palette / spine id, for lane attribution. */
function laneOf(id: string): string | null {
  const item = APP_SIDEBAR_NAV.find((row) => row.id === id);
  return item ? spineSectionIdForPage(item) : null;
}

test('every desk lane carries a mobile-first status — no lane escapes the ledger', () => {
  // Uses the UNFILTERED section list via the raw registry: a lane missing from
  // the ledger would otherwise pass by being invisible to the gate.
  const gated = Object.keys(LANE_MOBILE_FIRST);
  const laneIds = [
    ...new Set(
      APP_SIDEBAR_NAV.map((item) => spineSectionIdForPage(item)).filter(
        // `floor` (Scan Stations) is the one lane the gate does not cover.
        (id): id is string => id !== null && id !== 'floor',
      ),
    ),
  ];
  for (const id of laneIds) {
    assert.ok(gated.includes(id), `lane "${id}" has no LANE_MOBILE_FIRST status`);
  }
});

test('the hidden lanes have no door on any surface', () => {
  const hidden = Object.entries(LANE_MOBILE_FIRST)
    .filter(([, status]) => status === 'hidden')
    .map(([id]) => id);
  assert.deepEqual(hidden.sort(), [...HIDDEN_LANE_IDS]);

  // `getSidebarNavItems` is the one funnel: spine, ⌘K, nav-destinations, the
  // header page switcher and recents all read it. Nothing in a hidden lane may
  // come out of it — that is what "no links to it" means mechanically.
  for (const item of getSidebarNavItems()) {
    const lane = spineSectionIdForPage(item);
    assert.ok(
      lane === null || isLaneVisible(lane),
      `hidden lane "${lane}" still yields a nav row: ${item.id}`,
    );
  }

  // And no header sits over nothing: a hidden lane is not a desk section.
  for (const section of DESK_SPINE_SECTIONS) {
    assert.ok(!hidden.includes(section.id), `hidden lane "${section.id}" still paints a header`);
  }
});

test('the desktop lanes still display after a mobile port — the gate does not eat them', () => {
  const sections = DESK_SPINE_SECTIONS.map((s) => s.id);
  // A lane keeps its desktop row whether it is awaiting its phone port or has
  // completed one. Fulfillment is now the latter.
  const expectedStatus = { inbound: 'desk-only', fulfillment: 'ported', inventory: 'desk-only', catalog: 'desk-only', sales: 'desk-only' } as const;
  for (const id of Object.keys(expectedStatus)) {
    assert.equal(LANE_MOBILE_FIRST[id as keyof typeof LANE_MOBILE_FIRST], expectedStatus[id as keyof typeof expectedStatus]);
    assert.ok(sections.includes(id as (typeof sections)[number]), `kept lane "${id}" vanished`);
  }
  const navLanes = new Set(
    getSidebarNavItems().map((item) => spineSectionIdForPage(item)),
  );
  for (const id of Object.keys(expectedStatus)) {
    assert.ok(navLanes.has(id as never), `kept lane "${id}" lost its rows`);
  }
});

test('the ROUTE survives the hidden door — hiding is not deleting', () => {
  // A bookmark must still resolve; deleting a surface is Track X, gated
  // separately. The raw registry keeps the rows the gate filters out.
  const rawIds = APP_SIDEBAR_NAV.map((item) => item.id);
  for (const id of ['operations', 'sales', 'support', 'studio']) {
    assert.ok(rawIds.includes(id), `${id} was DELETED from the registry, not hidden`);
  }
});

test('the ⌘K palette reads the gate on BOTH paths — no-arg build included', () => {
  // The leak this pins:
  const hidden = new Set<string>(HIDDEN_LANE_IDS);
  for (const groups of [buildCommandBarNavGroups(), buildCommandBarNavGroups(new Set())]) {
    for (const group of groups) {
      assert.ok(!hidden.has(group.id), `hidden lane "${group.id}" still paints a palette band`);
      for (const row of group.rows) {
        const lane = laneOf(row.id);
        assert.ok(
          lane === null || isLaneVisible(lane),
          `hidden lane "${lane}" still yields a palette row: ${row.id}`,
        );
      }
    }
  }
});

test('a stale saved spine order cannot resurrect a hidden lane', () => {
  // `prefs.spineSlots` is persisted, so a staffer who arranged the spine before the gate landed still has `sales` / `support` / `monitor`…
  const items = getSidebarNavItems();
  const stale = [...HIDDEN_LANE_IDS, 'sales', 'support', 'operations', ...items.map((i) => i.id)];
  const { slots } = migrateSpineSlots(stale, items, null);
  for (const entry of resolveSpineMapEntries(slots, items)) {
    const lane = entry.kind === 'page' ? laneOf(entry.page.id) : entry.kind === 'lane' ? entry.id : null;
    assert.ok(
      lane === null || isLaneVisible(lane),
      `hidden lane "${lane}" still resolves to a spine ${entry.kind} entry`,
    );
  }
});
