import assert from 'node:assert/strict';
import test from 'node:test';
import { getSidebarPageNav, resolveSidebarChild } from '@/lib/sidebar-navigation';

test('Locations exposes the five compact operator views and no Bay labels view', () => {
  const page = getSidebarPageNav('inventory');
  assert.ok(page);
  assert.deepEqual(
    page.children?.map(({ id, label }) => ({ id, label })),
    [
      { id: 'locations', label: 'All' },
      { id: 'rooms', label: 'Rooms' },
      { id: 'racks', label: 'Racks' },
      { id: 'map', label: 'Map' },
      { id: 'labels', label: 'Labels' },
    ],
  );
  assert.equal(page.children?.some((child) => child.id === 'bays'), false);
  assert.equal(page.children?.some((child) => child.id === 'totes'), false);
});

test('legacy Bay labels URLs resolve into Labels', () => {
  assert.equal(
    resolveSidebarChild('inventory', {
      pathname: '/inventory/locations',
      params: new URLSearchParams('tab=bays'),
    }),
    'labels',
  );
});

test('legacy Totes URLs fall back to All', () => {
  assert.equal(
    resolveSidebarChild('inventory', {
      pathname: '/inventory/locations',
      params: new URLSearchParams('tab=totes'),
    }),
    'locations',
  );
});
