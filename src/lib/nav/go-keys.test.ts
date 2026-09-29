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
