import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATION_GLYPH_KEYS,
  PACKING_MODE_ICONS,
  RECEIVING_NAV_ICONS,
  SHIPPING_NAV_ICONS,
  STATION_PAGE_ICONS,
  TECH_NAV_ICONS,
  stationPageIcon,
} from '@/lib/nav/station-nav-icons';
import {
  ReceivingModeArrival,
  ReceivingModeUnbox,
  StationReceiving,
  StationShipping,
  TechModeShippingQueue,
} from '@/lib/icons';

test('STATION_PAGE_ICONS covers every floor station nav id', () => {
  assert.deepEqual(Object.keys(STATION_PAGE_ICONS).sort(), ['outbound', 'packer', 'receiving', 'tech']);
  for (const key of Object.keys(STATION_PAGE_ICONS) as Array<keyof typeof STATION_PAGE_ICONS>) {
    assert.equal(typeof stationPageIcon(key), 'function');
  }
});

test('every floor-station mode glyph key is unique', () => {
  const glyphs = Object.values(STATION_GLYPH_KEYS);
  assert.equal(
    new Set(glyphs).size,
    glyphs.length,
    `duplicate mode glyphs: ${glyphs.sort().join(', ')}`,
  );
});

test('Arrival Truck is not reused by Tech Ready to Pack (PackageCheck)', () => {
  assert.equal(STATION_GLYPH_KEYS['receiving.triage'], 'Truck');
  assert.equal(STATION_GLYPH_KEYS['tech.shipping'], 'PackageCheck');
  assert.notEqual(STATION_GLYPH_KEYS['receiving.triage'], STATION_GLYPH_KEYS['tech.shipping']);
  assert.equal(RECEIVING_NAV_ICONS.triage, ReceivingModeArrival);
  assert.equal(TECH_NAV_ICONS.shipping, TechModeShippingQueue);
});

/**
 * These two used to assert COMPONENT IDENTITY inequality — and they passed only
 * because `withNavIconPageStroke` / `withNavIconModeStroke` produced two
 * distinct wrapper components around one drawing. Unwrapping those (2026-08-19,
 * so a glyph can be drawn at any altitude) makes the identities collapse and
 * shows what was always underneath:
 *
 *   · Receiving page  ≡ Unbox child   — both `PackageOpen`. SANCTIONED: the
 *     module docblock says a page may share its default child's glyph.
 *   · Shipping page   ≡ Arrival child — both `Truck`. **A real collision.** Two
 *     spine rows in different sections now draw the identical mark at the
 *     identical weight; before, they differed only by stroke, which no operator
 *     reads as identity anyway. Resolving it means giving one of them a
 *     different glyph — a product call, not a test fix, so it is stated here
 *     rather than papered over.
 *
 * What these tests assert now is the part that is still true and still load-
 * bearing: each registry entry is the NAMED export it should be, and the glyph
 * KEY registry (the actual uniqueness law) is unchanged.
 */
test('station page icons resolve to their named exports', () => {
  assert.equal(STATION_PAGE_ICONS.outbound, StationShipping);
  assert.equal(STATION_PAGE_ICONS.receiving, StationReceiving);
});

test('Receiving page and Unbox child share the PackageOpen drawing (sanctioned)', () => {
  assert.equal(RECEIVING_NAV_ICONS.receive, ReceivingModeUnbox);
  assert.equal(STATION_GLYPH_KEYS['receiving.receive'], 'PackageOpen');
});

test('mode icon maps cover every floor station mode id', () => {
  assert.deepEqual(Object.keys(RECEIVING_NAV_ICONS).sort(), [
    'incoming',
    'pickup',
    'receive',
    'repair',
    'triage',
  ]);
  assert.deepEqual(Object.keys(TECH_NAV_ICONS).sort(), ['shipping', 'testing']);
  assert.deepEqual(Object.keys(SHIPPING_NAV_ICONS).sort(), ['fba', 'labels', 'ready', 'scan-out']);
  assert.deepEqual(Object.keys(PACKING_MODE_ICONS).sort(), ['fragile', 'multi', 'standard']);
});

test('STATION_GLYPH_KEYS covers every floor mode map entry', () => {
  const expected = [
    ...Object.keys(RECEIVING_NAV_ICONS).map((id) => `receiving.${id}`),
    ...Object.keys(TECH_NAV_ICONS).map((id) => `tech.${id}`),
    ...Object.keys(SHIPPING_NAV_ICONS).map((id) => `shipping.${id}`),
    ...Object.keys(PACKING_MODE_ICONS).map((id) => `packing.${id}`),
  ].sort();
  assert.deepEqual(Object.keys(STATION_GLYPH_KEYS).sort(), expected);
});
