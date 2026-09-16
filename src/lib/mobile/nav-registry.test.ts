/**
 * nav-registry contracts — active-route identification for the /m shell.
 *
 * These predicates are the drawer's selection logic verbatim (moved 2026-09-14
 * from MobileSidebarDrawer). The nested-prefix rule is what keeps detail routes
 * (e.g. /m/pick/123) identifying their parent destination without falsely
 * matching siblings (/m/pickaxe).
 *
 * The mode-exclusivity suite is GONE (2026-09-15). It existed because Inbound
 * had three children sharing `/m/receiving` and differing only by `?mode=`;
 * the operator removed those rows ("keep the photo feed only"), so
 * `isChildActive` and `hrefMode` were deleted with them rather than re-pinned
 * to a shape nothing produces.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBILE_NAV_DESTINATIONS,
  MOBILE_NAV_TAB_DESTINATIONS,
  isGroupActive,
  isLeafActive,
} from './nav-registry';
import { domainLane, type DomainGroupId } from '@/lib/nav/lanes';
import { PackageOpen } from '@/components/Icons';
import type { SidebarIconComponent } from '@/lib/sidebar-navigation';

// ─── isLeafActive ────────────────────────────────────────────────────────────

test('leaf activates on exact match', () => {
  assert.equal(isLeafActive('/m/pick', '/m/pick'), true);
});

test('leaf activates on nested detail routes', () => {
  assert.equal(isLeafActive('/m/pick/123', '/m/pick'), true);
  assert.equal(isLeafActive('/m/receiving/po/88/item/4', '/m/receiving'), true);
});

test('leaf does not activate on a longer sibling path sharing the prefix', () => {
  assert.equal(isLeafActive('/m/pickaxe', '/m/pick'), false);
});

// (The /m/home exact-only test was deleted with the route — 2026-09-14
// operator ruling; no destination special-cases remain in isLeafActive.)

test('null pathname never activates', () => {
  assert.equal(isLeafActive(null, '/m/pick'), false);
});

// ─── isGroupActive ───────────────────────────────────────────────────────────

test('the Outbound lane activates on every route it claims', () => {
  const outbound = MOBILE_NAV_DESTINATIONS.find((item) => item.id === 'fulfillment');
  assert.equal(outbound?.kind, 'group');
  if (outbound?.kind !== 'group') return;
  for (const p of ['/m/work', '/m/pick', '/m/pick/9', '/m/orders/12']) {
    assert.equal(isGroupActive(p, outbound.matchPrefixes), true, p);
  }
  assert.equal(isGroupActive('/m/receiving', outbound.matchPrefixes), false);
});

// ─── Inbound: an Unbox parent over one Photo feed child (operator 2026-09-15) ─

test('Inbound is an Unbox parent whose only child is Photo feed', () => {
  const inbound = MOBILE_NAV_DESTINATIONS.find((item) => item.id === 'inbound');
  assert.equal(inbound?.kind, 'group');
  if (inbound?.kind !== 'group') return;
  // The parent names the WORK and is the altitude the operator asked for
  // ("the photo feed should still display as a child under unbox as the
  // parent"), so the feed must not be promoted to a flat L0 row.
  assert.equal(inbound.label, 'Unbox');
  assert.deepEqual(
    inbound.children.map((c) => ({ label: c.label, href: c.href })),
    [{ label: 'Photo feed', href: '/m/receiving' }],
  );
});

test('the removed inbound doors are unreachable from the drawer', () => {
  const hrefs = MOBILE_NAV_DESTINATIONS.flatMap((item) =>
    item.kind === 'group' ? item.children.map((c) => c.href) : [item.href],
  );
  // `/m/unbox` is deleted outright (Track U: it was a second scan door). The
  // others keep their routes — a door is not a surface — but must not be
  // reachable from the drawer.
  for (const gone of [
    '/m/unbox',
    '/m/consult',
    '/m/receiving?mode=local-pickup',
    '/m/receiving?mode=repair',
  ]) {
    assert.equal(hrefs.includes(gone), false, gone);
  }
});

test('the inbound child activates on its nested detail routes', () => {
  assert.equal(isLeafActive('/m/receiving', '/m/receiving'), true);
  assert.equal(isLeafActive('/m/receiving/history', '/m/receiving'), true);
  assert.equal(isLeafActive('/m/receive', '/m/receiving'), false);
});

// ─── Registry integrity ──────────────────────────────────────────────────────

test('destination ids are unique', () => {
  const ids: string[] = [];
  for (const item of MOBILE_NAV_DESTINATIONS) {
    ids.push(item.id);
    if (item.kind === 'group') ids.push(...item.children.map((c) => c.id));
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('every destination href routes into the /m app', () => {
  for (const item of MOBILE_NAV_DESTINATIONS) {
    if (item.kind === 'leaf') assert.ok(item.href.startsWith('/m'), item.href);
    else for (const child of item.children) assert.ok(child.href.startsWith('/m'), child.href);
  }
});

test('the icon law: every PARENT carries a glyph, no child has the field', () => {
  for (const item of MOBILE_NAV_DESTINATIONS) {
    // Operator 2026-09-14: "icon at the parent level only". An L0 row and a
    // lane header are both parents; a row inside a lane is not.
    assert.equal(typeof item.icon, 'function', `${item.id} is a parent and needs a glyph`);
    if (item.kind !== 'group') continue;
    for (const child of item.children) {
      assert.equal(
        'icon' in child,
        false,
        `${item.id}/${child.id} is a child — the glyph belongs to its lane`,
      );
    }
  }
});

test('lane faces come from the shared registry, with one ruled divergence', () => {
  const groups = MOBILE_NAV_DESTINATIONS.filter((item) => item.kind === 'group');
  assert.deepEqual(
    groups.map((g) => g.id),
    ['inbound', 'fulfillment'],
  );

  // The phone's ONLY overrides, as a closed set. Everything absent from this
  // map must match `domainLane`, so the phone drawer and the desk spine cannot
  // drift apart — and a SECOND divergence has to be ruled here, not typed into
  // the destination list.
  //
  // `inbound` diverges on BOTH axes (operator 2026-09-15):
  //   label — the desk names the DIRECTION (a desk holds deliveries, sourcing
  //           and unfound alike); the phone names the one verb a floor staffer
  //           performs.
  //   icon  — *"ensure the unbox parent level navigation is still the package
  //           open, not the inbox."* `Inbox` is a tray things arrive in;
  //           `PackageOpen` is the act. The repo already marks Unbox with
  //           `PackageOpen` (`STATION_GLYPH_KEYS['receiving.receive']`).
  const PHONE_LANE_FACES: Record<string, { label: string; icon: SidebarIconComponent }> = {
    inbound: { label: 'Unbox', icon: PackageOpen },
  };

  for (const group of groups) {
    const lane = domainLane(group.id as DomainGroupId);
    const override = PHONE_LANE_FACES[group.id];
    assert.equal(group.label, override?.label ?? lane.label, `${group.id} label`);
    assert.equal(group.icon, override?.icon ?? lane.icon, `${group.id} icon`);
  }

  // The override is a divergence, not a copy: if the desk lane is ever renamed
  // or re-glyphed to match, this map is dead weight and should be deleted.
  assert.notEqual(domainLane('inbound').label, 'Unbox');
  assert.notEqual(domainLane('inbound').icon, PackageOpen);
});

test('Outbound rows are the U2 survivors only — /m/work (KEPT) and /m/pick (LIVE)', () => {
  const outbound = MOBILE_NAV_DESTINATIONS.find((item) => item.id === 'fulfillment');
  assert.equal(outbound?.kind, 'group');
  // `/m/work` was the mobile landing default with no drawer row at all.
  // `/m/orders/new` is GATED by plan §1.7 — "the drawer may only row up LIVE
  // and KEPT routes" — so it deliberately has no row until the operator rules.
  assert.deepEqual(
    outbound?.kind === 'group' ? outbound.children.map((c) => c.href) : [],
    ['/m/work', '/m/pick'],
  );
});

test('Scan stays out of the drawer — it owns the permanent top-right seat', () => {
  const hrefs: string[] = [];
  for (const item of MOBILE_NAV_DESTINATIONS) {
    hrefs.push(item.href ?? '');
    if (item.kind === 'group') hrefs.push(...item.children.map((c) => c.href));
  }
  assert.equal(hrefs.includes('/m/scan'), false);
});

// ─── Bottom-nav tab destinations ─────────────────────────────────────────────

test('every bottom-nav tab except signout routes into /m; signout is an action', () => {
  for (const [tab, dest] of Object.entries(MOBILE_NAV_TAB_DESTINATIONS)) {
    if (tab === 'signout') assert.equal(dest.href, null);
    else assert.ok(dest.href?.startsWith('/m'), `${tab} → ${dest.href}`);
  }
});

test('the center scan tab routes to the universal scanner', () => {
  assert.equal(MOBILE_NAV_TAB_DESTINATIONS.scan.href, '/m/scan');
});
