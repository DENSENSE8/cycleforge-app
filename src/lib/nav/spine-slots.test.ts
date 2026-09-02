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
  resolveSpineMapEntries,
  resolveSpineSlotPages,
  spineParentDrillId,
  spineStructuralTopPages,
  SPINE_DESKS_SLOT_ID,
  SPINE_SLOTS_MAX,
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

test('null / empty / absent hydrate to Scan Stations then Desks then remaining L1', () => {
  assert.deepEqual(hydrateSpineSlots(null, catalog), [
    SPINE_STATIONS_SLOT_ID,
    SPINE_DESKS_SLOT_ID,
    'studio',
  ]);
  assert.deepEqual(hydrateSpineSlots(undefined, catalog), defaultSpineOrder(catalog));
  assert.deepEqual(hydrateSpineSlots([], catalog), defaultSpineOrder(catalog));
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
    [SPINE_STATIONS_SLOT_ID, SPINE_DESKS_SLOT_ID, 'studio'],
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

test('spineParentDrillId maps floor to Scan Stations and domains to Desks', () => {
  assert.equal(spineParentDrillId('floor'), SPINE_STATIONS_SLOT_ID);
  assert.equal(spineParentDrillId('fulfillment'), SPINE_DESKS_SLOT_ID);
  assert.equal(spineParentDrillId('monitor'), SPINE_DESKS_SLOT_ID);
  assert.equal(spineParentDrillId('studio'), null);
  assert.equal(spineParentDrillId(null), null);
});

test('spineStructuralTopPages keeps only painted top map rows', () => {
  assert.deepEqual(
    spineStructuralTopPages(catalog).map((p) => p.id),
    ['home', 'ops-photos'],
  );
});
