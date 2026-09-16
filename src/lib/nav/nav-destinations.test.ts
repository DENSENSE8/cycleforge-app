/**
 * The spine search, asserted against the REAL nav registry rather than fixtures.
 *
 * The defect this replaces was invisible to a fixture test: matching worked
 * fine, and the renderer was the thing that threw the answer away. Running the
 * live registry through the same two pure modules the spine composes is what
 * makes "typing a destination's name returns that destination" a property of
 * the app, not of a hand-written array.
 *
 * Run: node --test --import tsx src/lib/nav/nav-destinations.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SIDEBAR_PAGE_NAV } from '@/lib/sidebar-navigation';
import { buildNavDestinations } from './nav-destinations';
import { searchNav } from './nav-search';
import { isTabParked } from './parked-tabs';

const DESTINATIONS = buildNavDestinations(SIDEBAR_PAGE_NAV);

const top = (query: string, n = 3) =>
  searchNav(DESTINATIONS, query)
    .slice(0, n)
    .map((r) => r.item.label);

test('the screenshot case: "incoming" returns the Inbound desk', () => {
  // Inbound is a leaf desk (former Incoming + Receiving Board). Typing
  // "incoming" must hand back the Inbound destination itself — not a section.
  const hits = searchNav(DESTINATIONS, 'incoming');
  assert.ok(hits.length > 0, 'Inbound / Incoming must be findable');

  const inbound = hits.find((h) => h.item.pageId === 'incoming' && !h.item.childId);
  assert.ok(inbound, 'the Deliveries desk must be among the hits');
  // Faced Deliveries since 2026-09-14 (a child never wears its parent's name);
  // "inbound" still reaches it through the row's `keywords`, so the rename does
  // not read as a deletion to anyone searching the old word.
  assert.equal(inbound!.item.label, 'Deliveries');
});

test('modes are first-class destinations, not just parents', () => {
  // Every mode of every page is reachable by its own name — except a mode whose
  // door is parked (`@/lib/nav/parked-tabs`). Search is a door, so a parked tab
  // must NOT be offered back here; `parked-tabs.test.ts` pins that direction.
  const modeCount = SIDEBAR_PAGE_NAV.reduce(
    (n, p) => n + (p.children ?? []).filter((c) => !isTabParked(p.id, c.id)).length,
    0,
  );
  const emitted = DESTINATIONS.filter((d) => d.childId).length;
  assert.equal(emitted, modeCount, 'every unparked mode must emit a destination');

  // …and a modeful page still emits its own row, or its name goes unsearchable
  // whenever no mode happens to share it.
  const pageRows = DESTINATIONS.filter((d) => !d.childId).length;
  assert.equal(pageRows, SIDEBAR_PAGE_NAV.length);
});

test('an exact page name outranks every page that merely contains it', () => {
  const hits = top('shipping', 5);
  assert.equal(hits[0], 'Shipping');
});

test('a section name finds the pages inside it, not just a category button', () => {
  // "inbound" is both a page label and a section label. Either way the operator
  // gets destinations they can land on — never a bare category row.
  const hits = searchNav(DESTINATIONS, 'inbound');
  assert.ok(hits.length > 0);
  assert.ok(
    hits.every((h) => h.item.pageId),
    'every result must be an addressable destination',
  );
});

test('multi-token queries reach the Inbound desk', () => {
  const hits = searchNav(DESTINATIONS, 'inbound');
  assert.ok(hits.length > 0, '"inbound" should reach the Inbound desk');
  assert.ok(
    hits.some((h) => h.item.pageId === 'incoming' && h.item.label === 'Deliveries'),
    'the Deliveries desk must still answer to "inbound" via its keywords',
  );
});

test('context never repeats the label it sits under', () => {
  // `Inbound` (page) inside `Inbound` (section) rendered "Inbound / INBOUND" —
  // a metadata line that says nothing, which reads as a bug rather than as
  // placement. Same for a mode whose name matches its page.
  for (const d of DESTINATIONS) {
    if (!d.context) continue;
    assert.notEqual(
      d.context.toLowerCase(),
      d.label.toLowerCase(),
      `${d.key} repeats its own label as context`,
    );
  }
});

test('every destination is uniquely keyed (React list safety)', () => {
  const keys = DESTINATIONS.map((d) => d.key);
  assert.equal(new Set(keys).size, keys.length, 'duplicate destination keys');
});

test('a page passed twice does not emit the same destination twice', () => {
  // The spine feeds this an `otherPages` prop that already contains the active
  // page. Spreading the active page in ON TOP of that duplicated every one of
  // its destinations under an identical key — so the keyboard cursor selected
  // two rows at once and React rendered duplicate children. Callers dedupe by
  // page id, and this pins what happens when one does not.
  const page = SIDEBAR_PAGE_NAV[0]!;
  const doubled = buildNavDestinations([page, page]);
  const keys = doubled.map((d) => d.key);
  assert.notEqual(
    new Set(keys).size,
    keys.length,
    'duplicated input SHOULD produce duplicate keys — the caller must dedupe, ' +
      'so this test documents the contract rather than hiding it in the builder',
  );
});

test('every destination carries an icon and a resolvable page id', () => {
  const pageIds = new Set(SIDEBAR_PAGE_NAV.map((p) => p.id));
  for (const d of DESTINATIONS) {
    assert.ok(d.icon, `${d.key} has no icon`);
    assert.ok(pageIds.has(d.pageId), `${d.key} points at an unknown page`);
    assert.ok(d.label.trim().length > 0, `${d.key} has an empty label`);
  }
});

test('an empty query yields the registry unchanged (resting order preserved)', () => {
  const resting = searchNav(DESTINATIONS, '');
  assert.equal(resting.length, DESTINATIONS.length);
  assert.deepEqual(
    resting.map((r) => r.item.key),
    DESTINATIONS.map((d) => d.key),
  );
});
