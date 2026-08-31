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
  spineStructuralTopPages,
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
];

test('null / empty / absent hydrate to default order with one Scan Stations slot', () => {
  assert.deepEqual(hydrateSpineSlots(null, catalog), [
    'outbound',
    SPINE_STATIONS_SLOT_ID,
    'products',
  ]);
  assert.deepEqual(hydrateSpineSlots(undefined, catalog), defaultSpineOrder(catalog));
  assert.deepEqual(hydrateSpineSlots([], catalog), defaultSpineOrder(catalog));
});

test('hydrate keeps staff order and appends new catalog ids', () => {
  assert.deepEqual(hydrateSpineSlots([SPINE_STATIONS_SLOT_ID, 'outbound'], catalog), [
    SPINE_STATIONS_SLOT_ID,
    'outbound',
    'products',
  ]);
});

test('hydrate collapses legacy station page ids into one floor slot', () => {
  assert.deepEqual(hydrateSpineSlots(['pickup', 'outbound', 'triage'], catalog), [
    SPINE_STATIONS_SLOT_ID,
    'outbound',
    'products',
  ]);
});

test('hydrate drops unknown ids and structural / parked tops', () => {
  assert.deepEqual(
    hydrateSpineSlots(['home', 'ghost', SPINE_STATIONS_SLOT_ID, 'search'], catalog),
    [SPINE_STATIONS_SLOT_ID, 'outbound', 'products'],
  );
});

test('hydrate caps at SPINE_SLOTS_MAX', () => {
  const many = Array.from({ length: SPINE_SLOTS_MAX + 5 }, (_, i) => `id-${i}`);
  const allowed: SidebarNavItem[] = many.map((id) => ({
    id,
    label: id,
    href: `/${id}`,
    icon: Icon,
    kind: 'domain' as const,
    domainGroup: 'catalog' as const,
  }));
  assert.equal(hydrateSpineSlots(many, allowed).length, SPINE_SLOTS_MAX);
  assert.equal(hydrateSpineSlots(null, allowed).length, SPINE_SLOTS_MAX);
});

test('isSpineSlottable excludes tops and station benches', () => {
  assert.equal(isSpineSlottable(catalog[0]!), false);
  assert.equal(isSpineSlottable(catalog[2]!), false);
  assert.equal(isSpineSlottable(catalog[3]!), true);
  assert.equal(isSpineSlottable(catalog[4]!), false);
});

test('resolveSpineSlotPages skips the stations slot', () => {
  const pages = resolveSpineSlotPages(
    [SPINE_STATIONS_SLOT_ID, 'outbound', 'triage'],
    catalog,
  );
  assert.deepEqual(
    pages.map((p) => p.id),
    ['outbound', 'triage'],
  );
});

test('resolveSpineMapEntries emits one stations entry among pages', () => {
  const entries = resolveSpineMapEntries(
    ['outbound', SPINE_STATIONS_SLOT_ID, 'products'],
    catalog,
  );
  assert.deepEqual(
    entries.map((e) => (e.kind === 'stations' ? e.id : e.page.id)),
    ['outbound', SPINE_STATIONS_SLOT_ID, 'products'],
  );
});

test('spineStructuralTopPages keeps only painted top map rows', () => {
  assert.deepEqual(
    spineStructuralTopPages(catalog).map((p) => p.id),
    ['home', 'ops-photos'],
  );
});
