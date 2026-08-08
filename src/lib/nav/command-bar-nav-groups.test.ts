/**
 * ⌘K palette buckets must mirror MasterNav spine contract.
 *
 * Run: node --test --import tsx src/lib/nav/command-bar-nav-groups.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCommandBarNavGroups,
  filterCommandBarNavGroups,
} from '@/lib/nav/command-bar-nav-groups';
import { SPINE_SECTIONS } from '@/lib/sidebar-navigation';

test('buildCommandBarNavGroups order is Pin → SPINE_SECTIONS → Account', () => {
  const groups = buildCommandBarNavGroups();
  const ids = groups.map((g) => String(g.id));

  assert.equal(ids[0], 'pin');
  assert.equal(ids[ids.length - 1], 'footer');

  // Section bands are a SUBSEQUENCE of SPINE_SECTIONS, not a copy of it: a
  // section with no visible page is omitted (the hollow-domain ban), so
  // asserting equality would make the palette contract depend on permissions.
  const sectionIds = ids.slice(1, -1);
  const order = SPINE_SECTIONS.map((s) => String(s.id));
  assert.deepEqual(
    sectionIds,
    order.filter((id) => sectionIds.includes(id)),
    'palette bands must follow SPINE_SECTIONS order',
  );
});

test('every spine section with pages emits a band whose label + icon come from the SoT', () => {
  const groups = buildCommandBarNavGroups();
  const emitted = new Set(groups.map((g) => String(g.id)));
  for (const section of SPINE_SECTIONS) {
    const group = groups.find((g) => g.id === section.id);
    if (!group) continue; // permission-filtered / no pages — omitted on purpose
    assert.equal(group.label, section.label);
    assert.equal(group.sectionIcon, section.icon);
  }
  // The eight locked sections all ship pages by default.
  for (const section of SPINE_SECTIONS) {
    assert.ok(emitted.has(String(section.id)), `${section.id} band missing by default`);
  }
});

test('pin contains Home Search Media Plans Chat; footer contains Studio Admin Settings', () => {
  const groups = buildCommandBarNavGroups();
  const pin = groups.find((g) => g.id === 'pin');
  const footer = groups.find((g) => g.id === 'footer');
  assert.ok(pin);
  assert.ok(footer);

  assert.deepEqual(
    pin!.rows.filter((r) => r.type === 'page').map((r) => r.id),
    ['home', 'search', 'ops-photos', 'plans-live', 'ai-chat'],
  );
  // Workflow Studio joined the footer band 2026-08-02 — it left SPINE_SECTIONS,
  // so the palette must find it here rather than dropping it entirely.
  assert.deepEqual(
    footer!.rows.filter((r) => r.type === 'page').map((r) => r.id),
    ['studio', 'admin', 'settings'],
  );
});

test('Scan Stations emits Receiving then Walk-In subgroup chrome before leaves', () => {
  const groups = buildCommandBarNavGroups();
  const floor = groups.find((g) => g.id === 'floor');
  assert.ok(floor);

  const subgroupRows = floor!.rows.filter((r) => r.type === 'subgroup');
  assert.deepEqual(
    subgroupRows.map((r) => (r.type === 'subgroup' ? r.id : null)),
    ['receiving', 'walk-in'],
  );
  assert.equal(subgroupRows[0]?.type, 'subgroup');
  if (subgroupRows[0]?.type === 'subgroup') {
    assert.equal(subgroupRows[0].label, 'Receiving');
  }
  assert.equal(subgroupRows[1]?.type, 'subgroup');
  if (subgroupRows[1]?.type === 'subgroup') {
    assert.equal(subgroupRows[1].label, 'Walk-In');
  }

  const arrival = floor!.rows.find(
    (r) => r.type === 'page' && r.id === 'triage',
  );
  assert.ok(arrival);
  assert.equal(arrival!.type, 'page');
  if (arrival!.type === 'page') {
    assert.equal(arrival.indented, true);
  }

  const pickup = floor!.rows.find(
    (r) => r.type === 'page' && r.id === 'pickup',
  );
  assert.ok(pickup);
  if (pickup!.type === 'page') {
    assert.equal(pickup.indented, true);
  }

  const testing = floor!.rows.find(
    (r) => r.type === 'page' && r.id === 'tech',
  );
  assert.ok(testing);
  if (testing!.type === 'page') {
    assert.equal(testing.indented ?? false, false);
  }
});

test('domain bands own their pages; the desk / print grab-bags are gone', () => {
  const groups = buildCommandBarNavGroups();
  const idsIn = (band: string) =>
    groups
      .find((g) => g.id === band)
      ?.rows.filter((r) => r.type === 'page')
      .map((r) => r.id) ?? [];

  assert.ok(idsIn('inbound').includes('incoming'), 'Inbound missing Incoming');
  assert.ok(idsIn('catalog').includes('products'), 'Catalog missing the products page');
  assert.ok(idsIn('inventory').includes('inventory'), 'Inventory missing inventory page');
  assert.equal(
    idsIn('inventory').includes('warehouse'),
    false,
    'Locations is Inventory L2, not a spine page',
  );
  assert.ok(idsIn('sourcing').includes('sourcing'), 'Sourcing missing its page');
  assert.ok(idsIn('fulfillment').includes('outbound'), 'Fulfillment missing Shipping');
  assert.ok(idsIn('support').includes('support'), 'Support missing its page');
  // Scan benches never appear under a domain band.
  for (const band of [
    'inbound',
    'catalog',
    'inventory',
    'sourcing',
    'fulfillment',
    'sales',
    'support',
  ]) {
    for (const bench of ['triage', 'receive', 'tech', 'packer', 'scan-out']) {
      assert.equal(idsIn(band).includes(bench), false, `${bench} leaked into ${band}`);
    }
  }

  const bandIds = groups.map((g) => String(g.id));
  assert.equal(bandIds.includes('desk'), false, 'Triage Desk band must stay retired');
  assert.equal(bandIds.includes('print'), false, 'Print Stations band must stay retired');
  const allPageIds = groups.flatMap((g) =>
    g.rows.filter((r) => r.type === 'page').map((r) => r.id),
  );
  assert.equal(allPageIds.includes('print-labels'), false, 'print hub rows deleted');
  assert.equal(allPageIds.includes('print-documents'), false, 'print hub rows deleted');

  assert.equal(
    groups.some(
      (g) => g.label === 'Stock' || g.label === 'Triage Desk' || g.label === 'Print Stations',
    ),
    false,
    'dead labels must not be root palette bands',
  );
});

/** A domain nobody can see is not a band — it is absent (hollow-domain ban). */
test('an unpermitted domain drops out of the palette entirely', () => {
  const groups = buildCommandBarNavGroups(new Set(['sku_stock.view']));
  const bandIds = groups.map((g) => String(g.id));
  assert.ok(bandIds.includes('catalog'), 'sku_stock.view keeps Catalog');
  assert.equal(bandIds.includes('support'), false, 'Support band hidden without its permission');
  assert.equal(bandIds.includes('sales'), false, 'Sales band hidden without its permission');
});

test('filterCommandBarNavGroups drops empty groups and subgroup chrome', () => {
  const groups = buildCommandBarNavGroups();
  const filtered = filterCommandBarNavGroups(groups, 'unbox');
  assert.ok(filtered.length >= 1);
  assert.ok(
    filtered.every((g) => g.rows.every((r) => r.type === 'page')),
    'filter drops subgroup chrome',
  );
  assert.ok(
    filtered.some((g) =>
      g.rows.some((r) => r.type === 'page' && r.id === 'receive'),
    ),
  );
});

test('permission filter hides gated pages', () => {
  const none = buildCommandBarNavGroups(new Set());
  const pageIds = none.flatMap((g) =>
    g.rows.filter((r) => r.type === 'page').map((r) => r.id),
  );
  // Ungated: home, search, settings
  assert.ok(pageIds.includes('home'));
  assert.ok(pageIds.includes('search'));
  assert.ok(pageIds.includes('settings'));
  assert.equal(pageIds.includes('operations'), false);
  assert.equal(pageIds.includes('admin'), false);
});
