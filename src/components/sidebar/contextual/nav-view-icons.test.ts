import assert from 'node:assert/strict';
import test from 'node:test';
import { NAV_VIEW_ICONS } from './nav-view-icons';
import { SIDEBAR_PAGE_NAV } from '@/lib/sidebar-navigation';
import { isTabParked } from '@/lib/nav/parked-tabs';

test('Deliveries lifecycle switchers use distinct semantic colors', () => {
  const tones = [
    NAV_VIEW_ICONS['incoming.pipeline']?.tone,
    NAV_VIEW_ICONS['incoming.docked']?.tone,
    NAV_VIEW_ICONS['incoming.unboxed']?.tone,
  ];

  assert.ok(tones.every(Boolean));
  assert.equal(new Set(tones).size, tones.length);
});

test('Labels & docs terminal icons each use a distinct color', () => {
  const tones = ['allocate', 'uploads', 'orders', 'printed'].map(
    (id) => NAV_VIEW_ICONS[`label-intake.${id}`]?.tone,
  );

  assert.ok(tones.every(Boolean));
  assert.equal(new Set(tones).size, tones.length);
  assert.notEqual(NAV_VIEW_ICONS['label-intake.allocate']?.tone, 'text-blue-600', 'Allocate must not repeat FBM parent blue');
});

test('Stock and Locations sibling icons each use a distinct color', () => {
  for (const [page, ids] of [
    ['stock', ['overview', 'all', 'replenish', 'low-stock', 'out-of-stock']],
    ['inventory', ['locations', 'rooms', 'racks', 'map', 'labels']],
  ] as const) {
    const tones = ids.map((id) => NAV_VIEW_ICONS[`${page}.${id}`]?.tone);
    assert.ok(tones.every(Boolean), `${page} has a child without an icon tone`);
    assert.equal(new Set(tones).size, tones.length, `${page} repeats a child icon color`);
  }
});


/**
 * THE COMPLETENESS FORMULA (owner 2026-09-29): every view row the contextual
 * sidebar can paint carries a glyph. Mirrors `build.ts` `sectionRows`: a row
 * is a page's unparked child, keyed `<pageId>.<childId>`.
 * A failure names the exact keys to add to `NAV_VIEW_ICONS`, so the fix is one
 * edit, not an investigation.
 */
test('every painted view row carries a glyph', () => {
  const missing: string[] = [];
  for (const page of SIDEBAR_PAGE_NAV) {
    // Deep-link / mode-resolution compat only — never an active page, so its
    // rows never reach a painter.
    if (page.id === 'receiving') continue;
    for (const child of page.children ?? []) {
      if (isTabParked(page.id, child.id)) continue;
      const rowId = child.id;
      const glyph = NAV_VIEW_ICONS[`${page.id}.${rowId}`];
      if (!glyph?.icon || !glyph.tone) missing.push(`${page.id}.${rowId}`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    'Add these keys to NAV_VIEW_ICONS (src/components/sidebar/contextual/nav-view-icons.ts) — icon + tone each',
  );
});

/**
 * Moving or retiring a destination may stop it painting, but it does not
 * authorize deleting its icon contract. Stale server payloads, extensions and
 * history can still name these rows. Keep the glyph until an explicit icon
 * migration replaces the key everywhere.
 */
test('navigation refactors retain established view icon contracts', () => {
  const retained = [
    'outbound.triage',
    'outbound.shipped',
    'outbound.exceptions',
    'inventory.sku-exceptions',
  ] as const;

  for (const key of retained) {
    assert.ok(NAV_VIEW_ICONS[key]?.icon, `${key} lost its established icon`);
    assert.ok(NAV_VIEW_ICONS[key]?.tone, `${key} lost its established icon tone`);
  }
});
