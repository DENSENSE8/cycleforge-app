import assert from 'node:assert/strict';
import test from 'node:test';
import { NAV_VIEW_ICONS } from './nav-view-icons';
import { SIDEBAR_PAGE_NAV } from '@/lib/sidebar-navigation';
import { isTabParked } from '@/lib/nav/parked-tabs';
import { DESK_VIEWS } from '@/lib/outbound/desk-views';

test('Deliveries lifecycle switchers use distinct semantic colors', () => {
  const tones = [
    NAV_VIEW_ICONS['incoming.pipeline']?.tone,
    NAV_VIEW_ICONS['incoming.docked']?.tone,
    NAV_VIEW_ICONS['incoming.unboxed']?.tone,
  ];

  assert.ok(tones.every(Boolean));
  assert.equal(new Set(tones).size, tones.length);
});

/**
 * THE COMPLETENESS FORMULA (owner 2026-09-29): every view row the contextual
 * sidebar can paint carries a glyph. Mirrors `build.ts` `sectionRows`: a row
 * is a page's unparked child, keyed `<pageId>.<childId>` — except the FBM
 * page, whose rows are keyed by the `DESK_VIEWS` view id, not its `navChild`.
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
      const rowId =
        page.id === 'outbound'
          ? DESK_VIEWS.find((view) => view.navChild === child.id)?.id ?? child.id
          : child.id;
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
