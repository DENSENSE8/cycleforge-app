/**
 * Unit tests for per-staff spine order hydrate.
 *   node --import tsx --test src/lib/nav/spine-slots.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSpineOrder,
  hydrateSpineSlots,
  isSpineSlottable,
  migrateSpineSlots,
  resolveSpineMapEntries,
  resolveSpineSlotPages,
  spineParentDrillId,
  spineStructuralBottomPages,
  spineStructuralTopPages,
  LEGACY_DESKS_SLOT_ID,
  SPINE_LANE_SLOT_IDS,
  SPINE_SLOTS_MAX,
  SPINE_SLOTS_VERSION,
  SPINE_STATIONS_SLOT_ID,
} from './spine-slots';
import { getSidebarNavItems } from '@/lib/sidebar-navigation';
import type { SidebarNavItem } from '@/lib/sidebar-navigation';

const Icon = () => null as unknown as JSX.Element;

const catalog: SidebarNavItem[] = [
  { id: 'home', label: 'Home', href: '/', icon: Icon, kind: 'top' },
  { id: 'ops-photos', label: 'Media Library', href: '/ops/photos', icon: Icon, kind: 'top' },
  { id: 'search', label: 'Search', href: '/search', icon: Icon, kind: 'top', spineBand: false },
  { id: 'print-station', label: 'Print station', href: '/print-station', icon: Icon, kind: 'top', spineBottom: true },
  { id: 'reports', label: 'Reports', href: '/reports', icon: Icon, kind: 'top', spineBottom: true },
  { id: 'outbound', label: 'Shipping', href: '/shipping', icon: Icon, kind: 'domain', domainGroup: 'fulfillment' },
  { id: 'pickup', label: 'Local Pickup', href: '/pickup', icon: Icon, kind: 'station', stationGroup: 'floor' },
  { id: 'triage', label: 'Arrival', href: '/triage', icon: Icon, kind: 'station', stationGroup: 'floor' },
  { id: 'products', label: 'Products', href: '/products', icon: Icon, kind: 'domain', domainGroup: 'catalog' },
  { id: 'studio', label: 'Operations Studio', href: '/studio', icon: Icon, kind: 'main', mainGroup: 'studio' },
];

test('null / empty / absent hydrate to Stations, the lane band, then remaining L1', () => {
  // Fixture desks: `outbound` (fulfillment) + `products` (catalog). Lanes emit
  // in DESK_SPINE_SECTIONS order, so fulfillment precedes catalog.
  assert.deepEqual(hydrateSpineSlots(null, catalog), [
    SPINE_STATIONS_SLOT_ID,
    'fulfillment',
    'catalog',
    'studio',
  ]);
  assert.deepEqual(hydrateSpineSlots(undefined, catalog), defaultSpineOrder(catalog));
  assert.deepEqual(hydrateSpineSlots([], catalog), defaultSpineOrder(catalog));
});

test('there is no Workspaces parent slot — lanes are the parents', () => {
  const order = defaultSpineOrder(catalog);
  assert.equal(order.includes(LEGACY_DESKS_SLOT_ID), false);
  assert.equal(order[0], SPINE_STATIONS_SLOT_ID);
  // Only lanes the catalog can paint appear; the other five stay absent.
  for (const lane of SPINE_LANE_SLOT_IDS) {
    if (lane === 'fulfillment' || lane === 'catalog') continue;
    assert.equal(order.includes(lane), false, `${lane} has no page and must be absent`);
  }
});

test('Scan Stations leads Operations immediately above the lane band', () => {
  const order = defaultSpineOrder(catalog);
  assert.equal(order[0], SPINE_STATIONS_SLOT_ID);
  assert.equal(order[1], 'fulfillment');
  assert.ok(order.indexOf('catalog') < order.indexOf('studio'));
});

test('a catalog with only benches yields only the stations slot', () => {
  const benchesOnly = catalog.filter((i) => i.kind === 'station');
  assert.deepEqual(defaultSpineOrder(benchesOnly), [SPINE_STATIONS_SLOT_ID]);
});

test('hydrate keeps staff lane order and appends new catalog ids', () => {
  assert.deepEqual(hydrateSpineSlots(['catalog', 'fulfillment'], catalog), [
    'catalog',
    'fulfillment',
    SPINE_STATIONS_SLOT_ID,
    'studio',
  ]);
});

test('hydrate collapses legacy station page ids into one floor slot', () => {
  assert.deepEqual(hydrateSpineSlots(['pickup', 'studio', 'triage'], catalog), [
    SPINE_STATIONS_SLOT_ID,
    'studio',
    'fulfillment',
    'catalog',
  ]);
});

test('hydrate folds a legacy desk PAGE id onto the lane that owns it', () => {
  assert.deepEqual(hydrateSpineSlots(['outbound', 'products', 'studio'], catalog), [
    'fulfillment',
    'catalog',
    'studio',
    SPINE_STATIONS_SLOT_ID,
  ]);
});

test('hydrate expands a saved Workspaces slot IN PLACE into the lane band', () => {
  // The staffer had moved the desk block below studio; the lanes arrive there,
  // not at the front — their position survives the dissolution.
  assert.deepEqual(hydrateSpineSlots(['studio', LEGACY_DESKS_SLOT_ID], catalog), [
    'studio',
    'fulfillment',
    'catalog',
    SPINE_STATIONS_SLOT_ID,
  ]);
});

test('hydrate drops unknown ids and structural / parked tops', () => {
  assert.deepEqual(
    hydrateSpineSlots(['home', 'ghost', SPINE_STATIONS_SLOT_ID, 'search'], catalog),
    [SPINE_STATIONS_SLOT_ID, 'fulfillment', 'catalog', 'studio'],
  );
});

test('hydrate caps at SPINE_SLOTS_MAX', () => {
  const many = Array.from({ length: SPINE_SLOTS_MAX + 5 }, (_, i) => `id-${i}`);
  const allowed: SidebarNavItem[] = many.map((id) => ({
    id,
    label: id,
    href: `/${id}`,
    icon: Icon,
    kind: 'main' as const,
    mainGroup: 'admin' as const,
  }));
  assert.equal(hydrateSpineSlots(many, allowed).length, SPINE_SLOTS_MAX);
  assert.equal(hydrateSpineSlots(null, allowed).length, SPINE_SLOTS_MAX);
});

test('isSpineSlottable excludes tops, station benches, and pointer desks', () => {
  assert.equal(isSpineSlottable(catalog.find((item) => item.id === 'home')!), false);
  assert.equal(isSpineSlottable(catalog.find((item) => item.id === 'search')!), false);
  assert.equal(isSpineSlottable(catalog.find((item) => item.id === 'outbound')!), false);
  assert.equal(isSpineSlottable(catalog.find((item) => item.id === 'pickup')!), false);
  assert.equal(isSpineSlottable(catalog.find((item) => item.id === 'studio')!), true);
  assert.equal(isSpineSlottable(catalog.find((item) => item.id === 'print-station')!), false);
  assert.equal(isSpineSlottable(catalog.find((item) => item.id === 'reports')!), false);
});

test('resolveSpineSlotPages skips the stations slot and every lane slot', () => {
  const pages = resolveSpineSlotPages(
    [SPINE_STATIONS_SLOT_ID, 'fulfillment', 'catalog', 'studio', 'triage'],
    catalog,
  );
  assert.deepEqual(
    pages.map((p) => p.id),
    ['studio', 'triage'],
  );
});

test('resolveSpineMapEntries emits one lane entry per painted lane', () => {
  const entries = resolveSpineMapEntries(
    [SPINE_STATIONS_SLOT_ID, 'fulfillment', 'catalog', 'studio'],
    catalog,
  );
  assert.deepEqual(
    entries.map((e) => e.kind),
    ['stations', 'lane', 'lane', 'page'],
  );
  assert.deepEqual(
    entries.map((e) => (e.kind === 'page' ? e.page.id : e.id)),
    [SPINE_STATIONS_SLOT_ID, 'fulfillment', 'catalog', 'studio'],
  );
});

test('resolveSpineMapEntries drops a lane the role cannot paint', () => {
  // `inbound` and `sales` have no page in this fixture: no header over nothing.
  const entries = resolveSpineMapEntries(
    ['inbound', 'fulfillment', 'sales', 'studio'],
    catalog,
  );
  assert.deepEqual(
    entries.map((e) => (e.kind === 'page' ? e.page.id : e.id)),
    ['fulfillment', 'studio'],
  );
});

test('spineParentDrillId is unused — groups render inline', () => {
  assert.equal(spineParentDrillId('floor'), null);
  assert.equal(spineParentDrillId('fulfillment'), null);
  assert.equal(spineParentDrillId('monitor'), null);
  assert.equal(spineParentDrillId('studio'), null);
  assert.equal(spineParentDrillId(null), null);
});

test('spineStructuralTopPages keeps only painted top map rows', () => {
  assert.deepEqual(
    spineStructuralTopPages(catalog).map((p) => p.id),
    ['home', 'ops-photos'],
  );
});

test('spineStructuralBottomPages keeps Print station then Reports outside drag order', () => {
  assert.deepEqual(
    spineStructuralBottomPages([...catalog].reverse()).map((page) => page.id),
    ['print-station', 'reports'],
  );
  const order = defaultSpineOrder(catalog);
  assert.equal(order.includes('print-station'), false);
  assert.equal(order.includes('reports'), false);
});

test('migrateSpineSlots moves Scan Stations above the lane run and stamps once', () => {
  const saved = ['fulfillment', 'catalog', 'studio', SPINE_STATIONS_SLOT_ID];
  const first = migrateSpineSlots(saved, catalog, undefined);
  assert.deepEqual(first.slots, [SPINE_STATIONS_SLOT_ID, 'fulfillment', 'catalog', 'studio']);
  assert.equal(first.slots[0], SPINE_STATIONS_SLOT_ID);
  assert.equal(first.stamp?.spineSlotsVersion, SPINE_SLOTS_VERSION);

  const second = migrateSpineSlots(saved, catalog, SPINE_SLOTS_VERSION);
  assert.deepEqual(second.slots, hydrateSpineSlots(saved, catalog));
  assert.equal(second.stamp, null);
});

test('an operator with no saved order needs no migrate write', () => {
  for (const raw of [null, undefined, []]) {
    const out = migrateSpineSlots(raw, catalog, undefined);
    assert.deepEqual(out.slots, defaultSpineOrder(catalog));
    assert.equal(out.stamp, null);
  }
});

test('v3 dissolves a saved Workspaces slot into the lane band and stamps once', () => {
  const saved = [LEGACY_DESKS_SLOT_ID, SPINE_STATIONS_SLOT_ID, 'studio'];
  const out = migrateSpineSlots(saved, catalog, 2);
  assert.deepEqual(out.slots, [
    SPINE_STATIONS_SLOT_ID,
    'fulfillment',
    'catalog',
    'studio',
  ]);
  assert.deepEqual(out.stamp?.spineSlots, out.slots);
  assert.equal(out.stamp?.spineSlotsVersion, SPINE_SLOTS_VERSION);
  assert.equal(out.slots.includes(LEGACY_DESKS_SLOT_ID), false);
});

test('a v1 order rolls forward to Scan Stations above the lane band', () => {
  const saved = [SPINE_STATIONS_SLOT_ID, LEGACY_DESKS_SLOT_ID, 'studio'];
  const out = migrateSpineSlots(saved, catalog, 1);
  assert.deepEqual(out.slots, [
    SPINE_STATIONS_SLOT_ID,
    'fulfillment',
    'catalog',
    'studio',
  ]);
});

test('v6 puts the Operations run first while preserving every non-business row afterward', () => {
  const saved = ['studio', SPINE_STATIONS_SLOT_ID, LEGACY_DESKS_SLOT_ID];
  const out = migrateSpineSlots(saved, catalog, 1);
  assert.deepEqual(out.slots, [
    SPINE_STATIONS_SLOT_ID,
    'fulfillment',
    'catalog',
    'studio',
  ]);
});

test('v6 normalizes a legacy custom order to Scan Stations then the lane run', () => {
  const saved = [SPINE_STATIONS_SLOT_ID, 'catalog', 'fulfillment'];
  const out = migrateSpineSlots(saved, catalog, 2);
  assert.deepEqual(out.slots, [SPINE_STATIONS_SLOT_ID, 'fulfillment', 'catalog', 'studio']);
});

test('the default draggable business run ends at Products; fixed utilities are separate', () => {
  const items = getSidebarNavItems({
    permissions: new Set([
      'dashboard.view',
      'walk_in.view',
      'receiving.view',
      'sourcing.view',
      'shipping.view',
      'fba.view',
      'packing.review',
      'sku_stock.view',
      'operations.view',
    ]),
  });
  assert.deepEqual(defaultSpineOrder(items).slice(0, 6), [
    SPINE_STATIONS_SLOT_ID,
    'sales',
    'inbound',
    'fulfillment',
    'inventory',
    'catalog',
  ]);
  const reports = items.find((item) => item.id === 'reports');
  assert.ok(reports);
  assert.equal(isSpineSlottable(reports), false);
});

test('the current order migration is idempotent and stamps once', () => {
  const first = migrateSpineSlots([SPINE_STATIONS_SLOT_ID, LEGACY_DESKS_SLOT_ID], catalog, 1);
  assert.equal(first.slots[0], SPINE_STATIONS_SLOT_ID);
  const second = migrateSpineSlots(first.slots, catalog, SPINE_SLOTS_VERSION);
  assert.deepEqual(second.slots, first.slots);
  assert.equal(second.stamp, null);
  // A staffer who drags the benches back on top at v3 keeps that choice.
  const dragged = [SPINE_STATIONS_SLOT_ID, 'fulfillment', 'catalog', 'studio'];
  const afterDrag = migrateSpineSlots(dragged, catalog, SPINE_SLOTS_VERSION);
  assert.equal(afterDrag.slots[0], SPINE_STATIONS_SLOT_ID);
  assert.equal(afterDrag.stamp, null);
});

test('the v3 lift no-ops when a role has only one of the two families', () => {
  const benchesOnly = catalog.filter((i) => i.kind === 'station' || i.kind === 'top');
  const out = migrateSpineSlots([SPINE_STATIONS_SLOT_ID], benchesOnly, 1);
  assert.deepEqual(out.slots, [SPINE_STATIONS_SLOT_ID]);
});

// ── dnd-kit + namespace invariants (v3) ───────────────────────────────────── `SortableContext items={spineOrder}` in SidebarNavList…

test('every slot id resolves to exactly one map entry — no orphan sortable', () => {
  for (const perms of [
    undefined,
    new Set(['shipping.view']),
    new Set(['receiving.view', 'sourcing.view']),
    new Set(['sku_stock.view']),
  ]) {
    const items = getSidebarNavItems(perms ? { permissions: perms } : {});
    const { slots } = migrateSpineSlots(null, items, undefined);
    const entries = resolveSpineMapEntries(slots, items);
    const rendered = entries.map((e) => (e.kind === 'page' ? e.page.id : e.id));
    assert.deepEqual(
      rendered,
      slots,
      'spineOrder and the rendered blocks must be the same ids in the same order',
    );
    assert.equal(new Set(slots).size, slots.length, 'a slot id must not repeat');
  }
});

test('lane slot ids never collide with a slottable page id', () => {
  // Lane ids are string-identical to some desk PAGE ids on purpose (see the SPINE_LANE_SLOT_IDS docblock).
  const lanes = new Set<string>(SPINE_LANE_SLOT_IDS);
  for (const item of getSidebarNavItems()) {
    if (!isSpineSlottable(item)) continue;
    assert.equal(
      lanes.has(item.id),
      false,
      `slottable page "${item.id}" collides with a lane slot id`,
    );
  }
});
