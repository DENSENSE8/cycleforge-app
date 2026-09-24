/**
 * The hard gate for the PARKED-TAB law (operator 2026-09-15): *"parking and
 * removing the tabs and displays from the code base … these are all the tabs
 * that are not working properly … inside of the parent level inventory you
 * will be parking health, quick picks, reason codes, replenish, graph, pulse,
 * tracking exceptions."*
 *
 * Runs in verify's **Unit tests** gate. `PARKED_TABS` is the ledger; this file
 * is what stops it from being decorative — the same relationship
 * `nav-mobile-first.test.ts` has to `LANE_MOBILE_FIRST`, one altitude down.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SIDEBAR_PAGE_NAV,
  filterPageChildren,
  getSidebarPageNav,
  resolveSidebarChild,
} from '@/lib/sidebar-navigation';
import { buildNavDestinations } from './nav-destinations';
import { PARKED_TABS, isTabParked } from './parked-tabs';

/**
 * Names the set for readable failures. The `deepEqual` below is the guard that
 * catches an accidental un-park, so it — not this list — is the truth.
 */
const PARKED_TAB_KEYS = [
  'inventory:favorites',
  'inventory:graph',
  'inventory:health',
  'inventory:pulse',
  'inventory:reason-codes',
  'inventory:replenish',
  'inventory:triage',
] as const;

/** Every `requires` in the registry, so permissions can never be the reason a row is absent. */
const ALL_PERMISSIONS = new Set<string>(
  SIDEBAR_PAGE_NAV.flatMap((page) => [
    ...(page.requires ? [page.requires] : []),
    ...(page.children ?? []).flatMap((child) => (child.requires ? [child.requires] : [])),
  ]),
);

test('the ledger names only real tabs — no stale entry survives a rename', () => {
  assert.deepEqual(Object.keys(PARKED_TABS).sort(), [...PARKED_TAB_KEYS]);

  for (const key of Object.keys(PARKED_TABS)) {
    const [pageId, childId] = key.split(':');
    const page = getSidebarPageNav(pageId!);
    assert.ok(page, `parked key "${key}" names no page`);
    assert.ok(
      page.children?.some((child) => child.id === childId),
      `parked key "${key}" names no child of ${pageId} — retire the entry or fix the id`,
    );
  }
});

test('a parked tab has no door on any surface', () => {
  // `filterPageChildren` is the one child funnel: the spine, the desk tab
  // band, the header page switcher and the ⌘K palette all read it. Run it with
  // EVERY permission granted, so absence can only mean the parked gate.
  for (const page of SIDEBAR_PAGE_NAV) {
    for (const child of filterPageChildren(page, ALL_PERMISSIONS).children ?? []) {
      assert.equal(
        isTabParked(page.id, child.id),
        false,
        `parked tab "${page.id}:${child.id}" still yields a nav child`,
      );
    }
  }

  // Destination search is the fourth door, and it reads `page.children` raw.
  for (const destination of buildNavDestinations(SIDEBAR_PAGE_NAV)) {
    if (!destination.childId) continue;
    assert.equal(
      isTabParked(destination.pageId, destination.childId),
      false,
      `parked tab "${destination.key}" still yields a ⌘K destination`,
    );
  }
});

test('the ROUTE survives the parked door — parking is not deleting', () => {
  // A bookmark must still land, and the child must keep its `resolveChild`
  // clause. Deleting a surface is its own gated increment.
  const at = (pathname: string, search = '') => ({
    pathname,
    params: new URLSearchParams(search),
  });

  assert.equal(resolveSidebarChild('inventory', at('/inventory/pulse')), 'pulse');
  assert.equal(resolveSidebarChild('inventory', at('/inventory/graph')), 'graph');
  assert.equal(resolveSidebarChild('inventory', at('/inventory/triage')), 'triage');
  assert.equal(resolveSidebarChild('inventory', at('/inventory/health')), 'health');
  assert.equal(resolveSidebarChild('inventory', at('/inventory/favorites')), 'favorites');
  assert.equal(
    resolveSidebarChild('inventory', at('/inventory/reason-codes')),
    'reason-codes',
  );
  assert.equal(
    resolveSidebarChild('inventory', at('/inventory', 'section=replenish')),
    'replenish',
  );
});

test('the Inventory tabs that work still display — parking is per tab, not per lane', () => {
  // The lane gate (`LANE_MOBILE_FIRST`) could only have hidden Inventory
  // whole, which is the wrong instrument: the desk is in daily use. These four
  // are why the tab altitude had to exist — Stock and SKU Exceptions lead
  // (owner 2026-09-24).
  const inventory = filterPageChildren(getSidebarPageNav('inventory')!, ALL_PERMISSIONS);
  assert.deepEqual(
    inventory.children?.map((child) => child.id),
    ['stock', 'sku-exceptions', 'ledger', 'locations'],
  );
});
