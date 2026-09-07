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
  spineStructuralTopPages,
  SPINE_DESKS_SLOT_ID,
  SPINE_SLOTS_MAX,
  SPINE_SLOTS_VERSION,
  SPINE_STATIONS_SLOT_ID,
} from './spine-slots';
import type { SidebarNavItem } from '@/lib/sidebar-navigation';

const Icon = () => null as unknown as JSX.Element;

const catalog: SidebarNavItem[] = [
  { id: 'home', label: 'Home', href: '/', icon: Icon, kind: 'top' },
  { id: 'ops-photos', label: 'Media Library', href: '/ops/photos', icon: Icon, kind: 'top' },
  { id: 'search', label: 'Search', href: '/search', icon: Icon, kind: 'top', spineBand: false },
  { id: 'outbound', label: 'Shipping', href: '/shipping', icon: Icon, kind: 'domain', domainGroup: 'fulfillment' },
  { id: 'pickup', label: 'Local Pickup', href: '/pickup', icon: Icon, kind: 'station', stationGroup: 'floor' },
  { id: 'triage', label: 'Arrival', href: '/triage', icon: Icon, kind: 'station', stationGroup: 'floor' },
  { id: 'products', label: 'Products', href: '/products', icon: Icon, kind: 'domain', domainGroup: 'catalog' },
  { id: 'studio', label: 'Operations Studio', href: '/studio', icon: Icon, kind: 'main', mainGroup: 'studio' },
];

test('null / empty / absent hydrate lead with Automations, then Stations, then Desks, then remaining L1', () => {
  assert.deepEqual(hydrateSpineSlots(null, catalog), [
    'studio',
    SPINE_STATIONS_SLOT_ID,
    SPINE_DESKS_SLOT_ID,
  ]);
  assert.deepEqual(hydrateSpineSlots(undefined, catalog), defaultSpineOrder(catalog));
  assert.deepEqual(hydrateSpineSlots([], catalog), defaultSpineOrder(catalog));
});

test('defaultSpineOrder leads with Automations only when the catalog carries it', () => {
  assert.equal(defaultSpineOrder(catalog)[0], 'studio');
  const withoutStudio = catalog.filter((i) => i.id !== 'studio');
  const order = defaultSpineOrder(withoutStudio);
  assert.ok(!order.includes('studio'));
  assert.equal(order[0], SPINE_STATIONS_SLOT_ID);
});

test('hydrate keeps staff order and appends new catalog ids', () => {
  assert.deepEqual(hydrateSpineSlots([SPINE_DESKS_SLOT_ID, SPINE_STATIONS_SLOT_ID], catalog), [
    SPINE_DESKS_SLOT_ID,
    SPINE_STATIONS_SLOT_ID,
    'studio',
  ]);
});

test('hydrate collapses legacy station page ids into one floor slot', () => {
  assert.deepEqual(hydrateSpineSlots(['pickup', 'studio', 'triage'], catalog), [
    SPINE_STATIONS_SLOT_ID,
    'studio',
    SPINE_DESKS_SLOT_ID,
  ]);
});

test('hydrate collapses legacy desk page ids into one desks slot', () => {
  assert.deepEqual(hydrateSpineSlots(['outbound', 'products', 'studio'], catalog), [
    SPINE_DESKS_SLOT_ID,
    'studio',
    SPINE_STATIONS_SLOT_ID,
  ]);
});

test('hydrate drops unknown ids and structural / parked tops', () => {
  assert.deepEqual(
    hydrateSpineSlots(['home', 'ghost', SPINE_STATIONS_SLOT_ID, 'search'], catalog),
    [SPINE_STATIONS_SLOT_ID, 'studio', SPINE_DESKS_SLOT_ID],
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
  assert.equal(isSpineSlottable(catalog[0]!), false);
  assert.equal(isSpineSlottable(catalog[2]!), false);
  assert.equal(isSpineSlottable(catalog[3]!), false);
  assert.equal(isSpineSlottable(catalog[4]!), false);
  assert.equal(isSpineSlottable(catalog[7]!), true);
});

test('resolveSpineSlotPages skips the stations and desks slots', () => {
  const pages = resolveSpineSlotPages(
    [SPINE_STATIONS_SLOT_ID, SPINE_DESKS_SLOT_ID, 'studio', 'triage'],
    catalog,
  );
  assert.deepEqual(
    pages.map((p) => p.id),
    ['studio', 'triage'],
  );
});

test('resolveSpineMapEntries emits stations and desks among remaining L1', () => {
  const entries = resolveSpineMapEntries(
    [SPINE_STATIONS_SLOT_ID, SPINE_DESKS_SLOT_ID, 'studio'],
    catalog,
  );
  assert.deepEqual(
    entries.map((e) => (e.kind === 'page' ? e.page.id : e.id)),
    [SPINE_STATIONS_SLOT_ID, SPINE_DESKS_SLOT_ID, 'studio'],
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

test('a customized operator is floated onto the new default exactly once', () => {
  const saved = [SPINE_DESKS_SLOT_ID, 'studio', SPINE_STATIONS_SLOT_ID];

  // Pre-versioning: Automations floats to the front, everything else keeps the
  // order the operator put it in, and the generation is stamped.
  const first = migrateSpineSlots(saved, catalog, undefined);
  assert.deepEqual(first.slots, ['studio', SPINE_DESKS_SLOT_ID, SPINE_STATIONS_SLOT_ID]);
  assert.deepEqual(first.stamp, {
    spineSlots: ['studio', SPINE_DESKS_SLOT_ID, SPINE_STATIONS_SLOT_ID],
    spineSlotsVersion: SPINE_SLOTS_VERSION,
  });

  // Already on this generation: their order is untouched, even when they have
  // deliberately dragged Automations back down.
  const second = migrateSpineSlots(saved, catalog, SPINE_SLOTS_VERSION);
  assert.deepEqual(second.slots, saved);
  assert.equal(second.stamp, null);
});

test('an operator with no saved order needs no write — they derive the default', () => {
  for (const raw of [null, undefined, []]) {
    const out = migrateSpineSlots(raw, catalog, undefined);
    assert.deepEqual(out.slots, defaultSpineOrder(catalog));
    assert.equal(out.stamp, null);
  }
});

test('an unresolved catalog never stamps an empty order over a real one', () => {
  const out = migrateSpineSlots([SPINE_DESKS_SLOT_ID, 'studio'], [], undefined);
  assert.equal(out.stamp, null);
});
