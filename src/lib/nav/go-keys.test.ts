import test from 'node:test';
import assert from 'node:assert/strict';
import { getSidebarPageNav, spineSectionIdForPage } from '@/lib/sidebar-navigation';
import { NAV_GO_KEYS, NAV_PAGE_GO_KEYS, navGoDestinations } from './go-keys';

test('on the Exceptions hub G then F / I / R opens its domains — children of the page, not other pages', () => {
  assert.deepEqual(navGoDestinations('exceptions'), [
    { letter: 'f', pageId: 'exceptions', childId: 'fulfillment' },
    { letter: 'i', pageId: 'exceptions', childId: 'inventory' },
    { letter: 'r', pageId: 'exceptions', childId: 'receiving' },
  ]);
});

test('a lane page keeps exactly its lane modes; page letters never leak off their page', () => {
  assert.deepEqual(navGoDestinations('fba'), [
    { letter: 's', pageId: 'outbound' },
    { letter: 'f', pageId: 'fba' },
    { letter: 'l', pageId: 'label-intake' },
  ]);
  assert.ok(navGoDestinations('inventory').every((destination) => destination.childId === undefined));
  assert.deepEqual(navGoDestinations(undefined), []);
});

test('Receiving hover teaching includes Deliveries, Purchasing, Local Pickup, Repair service and Sourcing', () => {
  const expected = [
    { letter: 'd', pageId: 'incoming' },
    { letter: 'u', pageId: 'purchasing' },
    { letter: 'p', pageId: 'pickup' },
    { letter: 'r', pageId: 'repair' },
    { letter: 's', pageId: 'sourcing' },
  ];
  for (const pageId of ['incoming', 'purchasing', 'pickup', 'repair', 'sourcing']) assert.deepEqual(navGoDestinations(pageId), expected, pageId);
});

test('Warehouse G keys open Stock with S and Locations with L', () => {
  const expected = [
    { letter: 's', pageId: 'stock' },
    { letter: 'l', pageId: 'inventory' },
    { letter: 'q', pageId: 'qc-labels' },
  ];

  for (const pageId of ['stock', 'inventory', 'qc-labels']) {
    assert.deepEqual(navGoDestinations(pageId), expected, pageId);
  }
});

test('Scan Stations G keys mirror the visible parent switcher', () => {
  const expected = [
    { letter: 'l', pageId: 'stations-live' },
    { letter: 'a', pageId: 'triage' },
    { letter: 'u', pageId: 'receive' },
    { letter: 'q', pageId: 'testing' },
    { letter: 'p', pageId: 'ready-to-pack' },
    { letter: 'k', pageId: 'packer' },
    { letter: 's', pageId: 'scan-out' },
  ];

  for (const pageId of ['stations-live', 'triage', 'receive', 'testing', 'ready-to-pack', 'packer', 'scan-out']) {
    assert.deepEqual(navGoDestinations(pageId), expected, pageId);
  }
});

test('every page letter names a real child and never shadows a lane letter on that page', () => {
  for (const [pageId, letters] of Object.entries(NAV_PAGE_GO_KEYS)) {
    const page = getSidebarPageNav(pageId);
    assert.ok(page, pageId);
    const childIds = new Set((page.children ?? []).map((child) => child.id));
    for (const childId of Object.values(letters)) assert.ok(childIds.has(childId), `${pageId}: ${childId}`);
    const laneId = spineSectionIdForPage(page);
    const lane = laneId ? (NAV_GO_KEYS[laneId] ?? {}) : {};
    for (const letter of Object.keys(letters)) assert.ok(!(letter in lane), `${pageId}: G ${letter}`);
  }
});
