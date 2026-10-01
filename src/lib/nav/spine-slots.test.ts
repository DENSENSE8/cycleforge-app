/** Fixed MasterNav ordering contract. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixedSpineOrder,
  resolveSpineMapEntries,
  spineStructuralBottomPages,
  spineStructuralTopPages,
  SPINE_STATIONS_SLOT_ID,
} from './spine-slots';
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

test('the product registry supplies one fixed root order', () => {
  assert.deepEqual(fixedSpineOrder(catalog), [
    SPINE_STATIONS_SLOT_ID,
    'fulfillment',
    'catalog',
    'studio',
  ]);
});

test('a catalog with only benches yields one Scan Stations door', () => {
  assert.deepEqual(
    fixedSpineOrder(catalog.filter((item) => item.kind === 'station')),
    [SPINE_STATIONS_SLOT_ID],
  );
});

test('fixed order resolves to the exact painted map entries', () => {
  const entries = resolveSpineMapEntries(catalog);
  assert.deepEqual(
    entries.map((entry) => (entry.kind === 'page' ? entry.page.id : entry.id)),
    [SPINE_STATIONS_SLOT_ID, 'fulfillment', 'catalog', 'studio'],
  );
  assert.deepEqual(
    entries.map((entry) => entry.kind),
    ['stations', 'lane', 'lane', 'page'],
  );
});

test('structural rows remain outside the main sequence', () => {
  assert.deepEqual(
    spineStructuralTopPages(catalog).map((page) => page.id),
    ['home', 'ops-photos'],
  );
  assert.deepEqual(
    spineStructuralBottomPages([...catalog].reverse()).map((page) => page.id),
    ['print-station', 'reports'],
  );
});
