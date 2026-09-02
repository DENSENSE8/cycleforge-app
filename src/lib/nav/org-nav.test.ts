/**
 * Unit tests for navigation-as-data merge (Phase 4). Pure / DB-free.
 *   node --import tsx --test src/lib/nav/org-nav.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { navChildDragId, parseNavChildDragId } from './nav-child-drag';
import {
  mergeOrgNav,
  parseNavDefinition,
  applyOrgNavToPage,
  upsertChildOrder,
  upsertChildIcon,
  type NavDefinition,
} from './org-nav';
import type { SidebarNavItem } from '@/lib/sidebar-navigation';

const Icon = () => null as unknown as JSX.Element;
const defaults: SidebarNavItem[] = [
  { id: 'operations', label: 'Operations', href: '/operations', icon: Icon, kind: 'main', mainGroup: 'monitor' },
  { id: 'receiving', label: 'Receiving', href: '/unbox', icon: Icon, kind: 'station', stationGroup: 'floor' },
  { id: 'outbound', label: 'Shipping', href: '/shipping', icon: Icon, kind: 'station', stationGroup: 'floor' },
  { id: 'settings', label: 'Settings', href: '/settings', icon: Icon, kind: 'bottom' },
];

test('null / empty override returns defaults unchanged (safe default)', () => {
  assert.deepEqual(mergeOrgNav(defaults, null).map((i) => i.id), defaults.map((i) => i.id));
  assert.deepEqual(mergeOrgNav(defaults, { entries: [] }).map((i) => i.id), defaults.map((i) => i.id));
});

test('hidden removes an item', () => {
  const override: NavDefinition = { entries: [{ id: 'outbound', hidden: true }] };
  const ids = mergeOrgNav(defaults, override).map((i) => i.id);
  assert.deepEqual(ids, ['operations', 'receiving', 'settings']);
});

test('label renames an item without moving it', () => {
  const override: NavDefinition = { entries: [{ id: 'receiving', label: 'Intake' }] };
  const merged = mergeOrgNav(defaults, override);
  assert.equal(merged.find((i) => i.id === 'receiving')?.label, 'Intake');
  assert.deepEqual(merged.map((i) => i.id), defaults.map((i) => i.id));
});

test('order floats an item to its slot; unset items keep relative order', () => {
  const override: NavDefinition = { entries: [{ id: 'outbound', order: 0 }] };
  const ids = mergeOrgNav(defaults, override).map((i) => i.id);
  // outbound (order 0) leads; the rest keep default relative order.
  assert.equal(ids[0], 'outbound');
  assert.deepEqual(ids.slice(1), ['operations', 'receiving', 'settings']);
});

test('an override cannot introduce an unknown item — it only references existing ids', () => {
  const override: NavDefinition = { entries: [{ id: 'not-a-real-page', label: 'Ghost', order: 0 }] };
  const ids = mergeOrgNav(defaults, override).map((i) => i.id);
  assert.deepEqual(ids, defaults.map((i) => i.id));
  assert.ok(!ids.includes('not-a-real-page'));
});

test('combined hide + rename + reorder', () => {
  const override: NavDefinition = {
    entries: [
      { id: 'operations', hidden: true },
      { id: 'receiving', label: 'Intake', order: 0 },
      { id: 'outbound', order: 1 },
    ],
  };
  const merged = mergeOrgNav(defaults, override);
  assert.deepEqual(merged.map((i) => i.id), ['receiving', 'outbound', 'settings']);
  assert.equal(merged[0].label, 'Intake');
});

test('parseNavDefinition narrows jsonb defensively', () => {
  assert.equal(parseNavDefinition(null), null);
  assert.equal(parseNavDefinition({ nope: 1 }), null);
  assert.deepEqual(
    parseNavDefinition({ entries: [{ id: 'a', hidden: true }, { id: 42 }, { bad: 1 }, { id: 'b', order: 2, label: 'B' }] }),
    { entries: [{ id: 'a', hidden: true }, { id: 'b', order: 2, label: 'B' }] },
  );
});

test('parseNavDefinition keeps catalog child icons and drops unknown keys', () => {
  assert.deepEqual(
    parseNavDefinition({
      entries: [
        {
          id: 'outbound',
          icon: 'NotAGlyph',
          children: [
            { id: 'shortage', icon: 'AlertCircle', order: 0 },
            { id: 'orders', icon: 'bogus' },
          ],
        },
      ],
    }),
    {
      entries: [
        {
          id: 'outbound',
          children: [
            { id: 'shortage', icon: 'AlertCircle', order: 0 },
            { id: 'orders' },
          ],
        },
      ],
    },
  );
});

test('upsertChildIcon ignores keys outside the catalog', () => {
  const next = upsertChildIcon(null, 'outbound', 'shortage', 'NotAGlyph');
  assert.deepEqual(next, { entries: [] });
});

test('child drag ids round-trip', () => {
  const id = navChildDragId('outbound', 'shortage');
  assert.deepEqual(parseNavChildDragId(id), { pageId: 'outbound', childId: 'shortage' });
  assert.equal(parseNavChildDragId('nav:outbound'), null);
});

test('child order and icon apply; unknown child ids are ignored', () => {
  const page = {
    id: 'outbound',
    label: 'Shipping',
    href: '/shipping/orders',
    icon: Icon,
    children: [
      { id: 'orders', label: 'To ship', icon: Icon, to: () => ({ pathname: '/shipping/orders' }) },
      { id: 'shortage', label: 'Shortage', icon: Icon, to: () => ({ pathname: '/shipping/shortage' }) },
      { id: 'fba', label: 'Amazon Prep', icon: Icon, to: () => ({ pathname: '/shipping/fba' }) },
    ],
  };
  const ordered = upsertChildOrder(null, 'outbound', ['shortage', 'orders', 'fba']);
  const withIcon = upsertChildIcon(ordered, 'outbound', 'shortage', 'AlertCircle');
  const merged = applyOrgNavToPage(page, withIcon);
  assert.deepEqual(merged.children?.map((c) => c.id), ['shortage', 'orders', 'fba']);
  assert.notEqual(merged.children?.[0]?.icon, Icon);
  const ghost = applyOrgNavToPage(page, {
    entries: [{ id: 'outbound', children: [{ id: 'not-a-tab', order: 0 }] }],
  });
  assert.deepEqual(ghost.children?.map((c) => c.id), ['orders', 'shortage', 'fba']);
});
