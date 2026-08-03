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
} from '@/components/Icons';

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

test('Arrival Truck is not reused by Tech Shipping queue (Send)', () => {
  assert.equal(STATION_GLYPH_KEYS['receiving.triage'], 'Truck');
  assert.equal(STATION_GLYPH_KEYS['tech.shipping'], 'Send');
  assert.notEqual(STATION_GLYPH_KEYS['receiving.triage'], STATION_GLYPH_KEYS['tech.shipping']);
  assert.equal(RECEIVING_NAV_ICONS.triage, ReceivingModeArrival);
  assert.equal(TECH_NAV_ICONS.shipping, TechModeShippingQueue);
});

test('Shipping station page icon is not the inbound Arrival truck glyph', () => {
  assert.notEqual(STATION_PAGE_ICONS.outbound, RECEIVING_NAV_ICONS.triage);
  assert.equal(STATION_PAGE_ICONS.outbound, StationShipping);
});

test('Receiving page and Unbox mode share PackageOpen but use different stroke wrappers', () => {
  assert.equal(STATION_PAGE_ICONS.receiving, StationReceiving);
  assert.equal(RECEIVING_NAV_ICONS.receive, ReceivingModeUnbox);
  assert.notEqual(STATION_PAGE_ICONS.receiving, RECEIVING_NAV_ICONS.receive);
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
