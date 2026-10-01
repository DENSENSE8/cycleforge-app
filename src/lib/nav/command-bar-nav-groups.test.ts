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
import { isLaneVisible } from '@/lib/nav/lanes';
import { SPINE_SECTIONS } from '@/lib/sidebar-navigation';

test('buildCommandBarNavGroups order is Pin → SPINE_SECTIONS', () => {
  const groups = buildCommandBarNavGroups();
  const ids = groups.map((g) => String(g.id));

  assert.equal(ids[0], 'pin');
  assert.equal(ids.includes('footer'), false, 'account pin band is gone from the default map');

  // Section bands are a SUBSEQUENCE of SPINE_SECTIONS, not a copy of it: a
  // section with no visible page is omitted (the hollow-domain ban), so
  // asserting equality would make the palette contract depend on permissions.
  const sectionIds = ids.slice(1);
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
  // Every VISIBLE spine section with pages ships a band by default.
  // mobile-first gate hides (`LANE_MOBILE_FIRST`, operator 2026-09-14) reaches
  for (const section of SPINE_SECTIONS) {
    const id = String(section.id);
    if (!isLaneVisible(id)) {
      assert.ok(!emitted.has(id), `hidden lane ${id} must not emit a ⌘K band`);
      continue;
    }
    assert.ok(emitted.has(id), `${section.id} band missing by default`);
  }
});

test('pin contains Chat Automations Home Exceptions Print station Search Media Plans Settings Reports; Monitor is parked, Admin is dissolved', () => {
  const groups = buildCommandBarNavGroups();
  const pin = groups.find((g) => g.id === 'pin');
  const footer = groups.find((g) => g.id === 'footer');
  assert.ok(pin);
  assert.equal(footer, undefined);

  // `reports` arrived 2026-09-15 with its promotion out of the Monitor lane to a parent-level spine row; the palette pin follows the…
  assert.deepEqual(
    pin!.rows.filter((r) => r.type === 'page').map((r) => r.id),
    ['ai-chat', 'home', 'studio', 'exceptions', 'print-station', 'search', 'ops-photos', 'plans-live', 'settings', 'reports'],
  );
  // Monitor (Operations) stays PARKED 2026-09-16 — the door is withdrawn on every surface, so the palette emits no band.
  assert.equal(
    groups.some((g) => g.id === 'monitor'),
    false,
    'parked lane "monitor" must not emit a ⌘K band',
  );
  // Automations (`studio`) is a top row under Chat since 2026-09-27, so it rides the pin — no lane band of its own.
  assert.equal(
    groups.some((g) => g.id === 'studio'),
    false,
    'Automations is a pin row, not a ⌘K lane band',
  );
  // Admin is DISSOLVED — `/admin` is a redirect table and permission is `requires` on rows, not a destination.
  assert.equal(
    groups.some((g) => g.id === 'admin'),
    false,
    'a dissolved Admin must not emit a ⌘K band',
  );
});

test('Scan Stations lists benches as a flat map — no Receiving / Walk-In chrome', () => {
  const groups = buildCommandBarNavGroups();
  const floor = groups.find((g) => g.id === 'floor');
  assert.ok(floor);

  assert.equal(
    floor!.rows.some((r) => r.type === 'subgroup'),
    false,
    'subgroup headers left the palette when the spine flattened',
  );

  // Repair service left the floor for the Receiving lane (owner 2026-09-29).
  const ids = floor!.rows.filter((r) => r.type === 'page').map((r) => r.id);
  assert.deepEqual(ids, [
    'stations-live',
    'triage',
    'receive',
    'testing',
    'ready-to-pack',
    'packer',
    'scan-out',
  ]);

  const arrival = floor!.rows.find((r) => r.type === 'page' && r.id === 'triage');
  assert.ok(arrival);
  const qc = floor!.rows.find((r) => r.type === 'page' && r.id === 'testing');
  assert.ok(qc);
  assert.equal(qc && qc.type === 'page' ? qc.label : null, 'Quality Control');
  const rtp = floor!.rows.find((r) => r.type === 'page' && r.id === 'ready-to-pack');
  assert.ok(rtp);
  assert.equal(rtp && rtp.type === 'page' ? rtp.label : null, 'Picker');
  assert.equal(
    floor!.rows.some((r) => r.type === 'page' && r.id === 'tech'),
    false,
    'parent Testing must not appear on Scan Stations',
  );
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
  // Sourcing folded into the Inbound lane (N4, operator 2026-09-14): the row
  // survives, its band changed. There is no `sourcing` band to look in.
  assert.ok(idsIn('inbound').includes('sourcing'), 'Inbound missing the Sourcing page');
  assert.equal(idsIn('sourcing').length, 0, 'the sourcing band must stay retired');
  assert.ok(idsIn('fulfillment').includes('outbound'), 'Outbound missing Shipping');
  // Support is HIDDEN by the mobile-first gate, so it owns no band. The ROUTE
  // and the registry row survive (`nav-mobile-first.test.ts`); the door does
  // not. Same for `sales` and `monitor`.
  assert.equal(idsIn('support').length, 0, 'a hidden lane must own no palette rows');
  // Scan benches never appear under a domain band.
  for (const band of [
    'inbound',
    'catalog',
    'inventory',
    'fulfillment',
    'sales',
    'support',
  ]) {
    for (const bench of ['stations-live', 'triage', 'receive', 'testing', 'ready-to-pack', 'packer', 'scan-out']) {
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
