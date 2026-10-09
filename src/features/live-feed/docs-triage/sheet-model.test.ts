import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PaperworkDocumentRow } from '@/lib/label-prints/contracts';
import type { OrderPacket, OrderPacketLine, PacketSlotState } from '@/lib/label-prints/order-packet-contracts';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import type { LabelPrintRoute } from '@/lib/label-prints/print-route';
import { isPacketComplete, nextOwed, nextRailFilter, printPreview, railFilterCounts, railRowsFor, sameSkuOwing } from './sheet-model';
import { parseSheetPrefs } from './sheet-prefs';

const line = (orderLineId: number, state: PacketSlotState, sku: string | null = 'A-1', manualIds: number[] = []): OrderPacketLine =>
  ({ orderLineId, sku, itemNumber: null, skuCatalogId: null, title: 't', quantity: 1, photoUrl: null, paperworkNotRequired: false, state, documents: manualIds.map((manualId) => ({ manualId }) as PaperworkDocumentRow) }) as OrderPacketLine;

const packet = (orderId: number, label: PacketSlotState, slip: PacketSlotState, lines: OrderPacketLine[] = [line(orderId * 10, 'filled')]): OrderPacket =>
  ({ orderId, orderRef: `o${orderId}`, label: { state: label, labels: [], documents: [], suggestions: [] }, slip: { state: slip, documents: [] }, lines }) as unknown as OrderPacket;

test('next owed walks this order’s later tabs, then the next orders, wrapping round', () => {
  const rows = [packet(1, 'missing', 'filled'), packet(2, 'filled', 'missing'), packet(3, 'filled', 'filled', [line(30, 'missing')])];
  assert.deepEqual(nextOwed(rows, { orderId: 2, tab: 'label' }), { orderId: 2, tab: 'slip' });
  assert.deepEqual(nextOwed(rows, { orderId: 2, tab: 'slip' }), { orderId: 3, tab: 'paperwork' });
  assert.deepEqual(nextOwed(rows, { orderId: 3, tab: 'paperwork' }), { orderId: 1, tab: 'label' });
});

test('next owed comes back to the current place last, and is null when everything is complete', () => {
  assert.deepEqual(nextOwed([packet(1, 'missing', 'filled'), packet(2, 'filled', 'filled')], { orderId: 1, tab: 'label' }), { orderId: 1, tab: 'label' });
  assert.equal(nextOwed([packet(1, 'filled', 'not_required'), packet(2, 'filled', 'filled')], { orderId: 1, tab: 'label' }), null);
  assert.equal(nextOwed([], { orderId: 1, tab: 'label' }), null);
});

test('a review state counts as owed; not required counts as complete', () => {
  assert.equal(isPacketComplete(packet(1, 'review', 'filled')), false);
  assert.equal(isPacketComplete(packet(1, 'not_required', 'not_required', [line(1, 'not_required')])), true);
});

test('the rail filters by anything owed, or by one owed tab', () => {
  const rows = [packet(1, 'missing', 'filled'), packet(2, 'filled', 'missing'), packet(3, 'filled', 'filled')];
  assert.deepEqual(railRowsFor(rows, 'all').map((p) => p.orderId), [1, 2, 3]);
  assert.deepEqual(railRowsFor(rows, 'owed').map((p) => p.orderId), [1, 2]);
  assert.deepEqual(railRowsFor(rows, 'slip').map((p) => p.orderId), [2]);
});

test('each filter counts its orders, and f cycles past the empty ones', () => {
  const rows = [packet(1, 'missing', 'filled'), packet(2, 'filled', 'missing'), packet(3, 'filled', 'filled')];
  assert.deepEqual(railFilterCounts(rows), { all: 3, owed: 2, label: 1, slip: 1, paperwork: 0 });
  assert.equal(nextRailFilter(rows, 'all'), 'owed');
  assert.equal(nextRailFilter(rows, 'slip'), 'all');
  assert.equal(nextRailFilter([packet(1, 'filled', 'filled')], 'all'), 'all');
});

test('next owed walks only what the filter shows', () => {
  const rows = [packet(1, 'missing', 'missing'), packet(2, 'filled', 'filled'), packet(3, 'missing', 'filled')];
  // A one-tab filter stays on that tab.
  assert.deepEqual(nextOwed(rows, { orderId: 1, tab: 'label' }, 'label'), { orderId: 3, tab: 'label' });
  // Off the filter's tab: this order's own place on it comes first.
  assert.deepEqual(nextOwed(rows, { orderId: 1, tab: 'paperwork' }, 'slip'), { orderId: 1, tab: 'slip' });
  // An order the filter hides starts the walk at the top.
  assert.deepEqual(nextOwed(rows, { orderId: 2, tab: 'label' }, 'owed'), { orderId: 1, tab: 'label' });
  assert.equal(nextOwed(rows, { orderId: 1, tab: 'label' }, 'paperwork'), null);
});

test('also-link offers only other orders owing paperwork on the same SKU key and lacking the manual', () => {
  const rows = [
    packet(1, 'filled', 'filled', [line(10, 'filled', 'a1', [9])]),
    packet(2, 'filled', 'filled', [line(20, 'filled', 'B-2'), line(21, 'missing', 'A-1')]),
    packet(3, 'filled', 'filled', [line(30, 'missing', 'A-1', [9])]),
    packet(4, 'filled', 'filled', [line(40, 'filled', 'A-1')]),
  ];
  assert.deepEqual(
    sameSkuOwing(rows, 1, { sku: 'a-1' }, 9).map(({ packet: p, line: l }) => [p.orderId, l.orderLineId]),
    [[2, 21]],
  );
  assert.deepEqual(sameSkuOwing(rows, 1, { sku: null }, 9), []);
});

test('the print preview names count, paper and destination per stock', () => {
  const doc = (stock: 'label' | 'paper') => ({ stock }) as DeskDocument;
  const routes = {
    label: { channel: 'THERMAL_USB', printerName: 'Zebra', paper: { label: '4×6' } },
    paper: { channel: 'BROWSER_DIALOG', printerName: null, paper: { label: 'Letter' } },
  } as unknown as Record<'label' | 'paper', LabelPrintRoute>;
  const here = { stationId: 'a', stationName: 'Desk', thisComputer: true };
  const there = { stationId: 'b', stationName: 'Packing', thisComputer: false };

  const lines = printPreview([doc('label'), doc('label'), doc('paper')], { label: here, paper: there }, () => null, routes);
  assert.deepEqual(
    lines.map((l) => l.text),
    ['2 label pages (4×6) → This computer · Zebra · Thermal · USB', '1 paperwork doc (Letter) → Packing'],
  );

  const blocked = printPreview([doc('paper')], { label: null, paper: there }, () => 'Packing is paused', null);
  assert.deepEqual(blocked, [{ stock: 'paper', count: 1, blocked: true, text: '1 paperwork doc → not sent — Packing is paused' }]);
});

test('sheet prefs read garbage, missing and unknown values as defaults', () => {
  assert.deepEqual(parseSheetPrefs(null), { railFolded: false, tab: null, filter: 'all' });
  assert.deepEqual(parseSheetPrefs('{not json'), { railFolded: false, tab: null, filter: 'all' });
  assert.deepEqual(parseSheetPrefs('{"railFolded":true,"tab":"slip","filter":"label"}'), { railFolded: true, tab: 'slip', filter: 'label' });
  assert.deepEqual(parseSheetPrefs('{"railFolded":"yes","tab":"invoice","filter":"missing"}'), { railFolded: false, tab: null, filter: 'all' });
});
