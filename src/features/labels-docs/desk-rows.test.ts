import assert from 'node:assert/strict';
import test from 'node:test';
import type { LabelPrintRow, PaperworkPrintRow } from '@/lib/label-prints/contracts';
import { deskBands, deskCardModel, deskRows, type DeskRow, findDeskRows, labelDeskRow, paperworkDocuments, unprintedPaperworkKeys } from './desk-rows';

const label = (id: number, over: Partial<LabelPrintRow> = {}): LabelPrintRow => ({
  id,
  state: 'LINKED',
  rowVersion: 1,
  source: 'SHIPSTATION_API',
  fileBasename: `label-${id}.pdf`,
  carrier: 'USPS',
  trackingNumber: `9400${id}`,
  quarantineReasonCode: null,
  shipstationShipmentId: null,
  observedAt: '2026-09-27T12:00:00.000Z',
  orderId: null,
  orderRef: null,
  printCount: 0,
  lastPrintedAt: null,
  lastPrintedBy: null,
  lastStationName: null,
  orderAccountSource: null,
  orderLines: [],
  ...over,
});

const paperwork = (orderId: number, orderRef: string, over: Partial<PaperworkPrintRow> = {}): PaperworkPrintRow => ({
  orderId,
  orderRef,
  orderAccountSource: 'ebay',
  orderLines: [{ orderLineId: orderId, itemNumber: '5076', skuCatalogId: 42, sku: 'BP-1', title: 'Brake pads', quantity: 1 }],
  documents: [],
  printCount: 0,
  lastPrintedAt: null,
  lastPrintedBy: null,
  lastStationName: null,
  observedAt: '2026-09-27T12:00:00.000Z',
  ...over,
});

const cardIds = (rows: DeskRow[]) => deskBands(rows)[0]![1].map((group) => group.rows.map((row) => row.id));

test('two labels shipping one order ride one card; unpaired labels stay their own', () => {
  const rows = [
    label(1, { orderId: 10, orderRef: '5010' }),
    label(2),
    // Another box of the same order, matched through a different line row.
    label(3, { orderId: 11, orderRef: '5010' }),
    label(4),
  ].map(labelDeskRow);
  assert.deepEqual(cardIds(rows), [[1, 3], [2], [4]]);
  const card = deskCardModel(deskBands(rows)[0]![1][0]!);
  assert.deepEqual(card.ids, [1, 3]);
  assert.equal(card.orderRef, '5010');
});

test('an unpaired label never borrows the marketplace ref as an order number', () => {
  const [row] = [label(5, { orderRef: '112-99' })].map(labelDeskRow);
  assert.equal(row!.orderRef, null);
});

test('Printed interleaves label and paperwork prints newest first and marries them on one order card', () => {
  const rows = deskRows({
    view: 'printed',
    labels: [
      label(1, { orderId: 10, orderRef: '5010', lastPrintedAt: '2026-09-27T10:00:00.000Z' }),
      label(2, { orderId: 20, orderRef: '5020', lastPrintedAt: '2026-09-27T12:00:00.000Z' }),
    ],
    paperwork: [paperwork(10, '5010', { lastPrintedAt: '2026-09-27T11:00:00.000Z' })],
    counts: { labels: 0, paperwork: 0, printed: 3 },
  });
  // Paperwork rows carry the negated order id — never an ingestion id.
  assert.deepEqual(rows.map((row) => row.id), [2, -10, 1]);
  assert.deepEqual(cardIds(rows), [[2], [-10, 1]]);
  const married = deskCardModel(deskBands(rows)[0]![1][1]!);
  assert.equal(married.labels.length, 1);
  assert.equal(married.paperwork.length, 1);
  assert.equal(married.accountSource, 'ebay');
});

test('a card with a quarantined label says why; a clean card says nothing', () => {
  const stuck = deskCardModel({ key: 'label:9', rows: [labelDeskRow(label(9, { state: 'QUARANTINED', quarantineReasonCode: 'ORDER_NOT_FOUND' }))] });
  assert.equal(stuck.problem, 'No order has this exact reference.');
  assert.equal(deskCardModel({ key: 'label:8', rows: [labelDeskRow(label(8))] }).problem, null);
});

test('find ignores case, spaces and dashes across tracking, order, file, carrier and document titles', () => {
  const rows = deskRows({
    view: 'printed',
    labels: [
      label(1, { orderId: 10, orderRef: '112-4455667-1234567', trackingNumber: '9400111899223344556677' }),
      label(2, { trackingNumber: '1Z999AA10123456784', carrier: 'UPS' }),
      label(3, { fileBasename: 'ShipStation batch 27.pdf' }),
    ],
    paperwork: [
      paperwork(40, '6000', {
        documents: [{ key: 'doc:7', kind: 'packing_slip', documentId: 7, manualId: null, title: 'Packing slip · invoice-5076.pdf', src: '/x', printCount: 0, lastPrintedAt: null, association: { source: 'order', orderLineIds: [40], itemNumber: null, sku: null, skuCatalogId: null } }],
      }),
    ],
    counts: { labels: 0, paperwork: 0, printed: 4 },
  });
  const ids = (query: string) => findDeskRows(rows, query).map((row) => row.id).sort((a, b) => a - b);
  assert.deepEqual(ids('9400 1118 9922'), [1]);
  assert.deepEqual(ids('1124455667'), [1]);
  assert.deepEqual(ids('1z999aa1'), [2]);
  assert.deepEqual(ids('batch 27'), [3]);
  assert.deepEqual(ids('ups'), [2]);
  assert.deepEqual(ids('invoice 5076'), [-40]);
  assert.deepEqual(ids('  '), [-40, 1, 2, 3]);
});

test('a Drive-only manual is listed but never printed, and a printed slip is not taken by default', () => {
  const row = paperwork(10, '5010', {
    documents: [
      { key: 'doc:1', kind: 'packing_slip', documentId: 1, manualId: null, title: 'Slip', src: '/api/documents/1/content', printCount: 1, lastPrintedAt: '2026-09-27T09:00:00.000Z', association: { source: 'order', orderLineIds: [10], itemNumber: null, sku: null, skuCatalogId: null } },
      { key: 'manual:2', kind: 'manual', documentId: null, manualId: 2, title: 'Manual', src: '/m/2', printCount: 0, lastPrintedAt: null, association: { source: 'item_number', orderLineIds: [10], itemNumber: '5076', sku: null, skuCatalogId: null } },
      { key: 'manual:3', kind: 'manual', documentId: null, manualId: 3, title: 'Drive manual', src: null, printCount: 0, lastPrintedAt: null, association: { source: 'sku', orderLineIds: [10], itemNumber: null, sku: 'BP-1', skuCatalogId: 42 } },
    ],
  });
  const { documents, unprintable } = paperworkDocuments([row]);
  assert.deepEqual(documents.map((doc) => [doc.key, doc.stock, doc.orderId]), [['doc:1', 'paper', 10], ['manual:2', 'paper', 10]]);
  assert.deepEqual(unprintable.map((doc) => doc.key), ['manual:3']);
  assert.equal(documents[0]?.associationLabel, 'Order 5010');
  assert.equal(documents[1]?.associationLabel, 'Item # 5076');
  assert.equal(unprintable[0]?.associationLabel, 'SKU BP-1');
  assert.deepEqual([...unprintedPaperworkKeys([row])], ['manual:2']);
});
