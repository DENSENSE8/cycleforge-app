import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LabelPrintRow, PaperworkDocumentRow } from '@/lib/label-prints/contracts';
import type { OrderPacket, OrderPacketLine, PacketLabelDocument } from '@/lib/label-prints/order-packet-contracts';
import { linkedItems, linkVerbLabel, resolveSelection, selectionOf, type PreviewManual } from './doc-selection';
import { labelUnpairCopy } from './verb-copy';

const manual = (manualId: number): PaperworkDocumentRow =>
  ({ key: `manual:${manualId}`, kind: 'manual', documentId: null, manualId, title: `Manual ${manualId}`, src: `/m/${manualId}`, printCount: 0, lastPrintedAt: null, association: { source: 'sku', orderLineIds: [], itemNumber: null, sku: 'A1', skuCatalogId: 1 } }) as PaperworkDocumentRow;

const line = (orderLineId: number, documents: PaperworkDocumentRow[] = []): OrderPacketLine =>
  ({ orderLineId, itemNumber: null, skuCatalogId: 1, sku: 'A1', title: 't', quantity: 1, photoUrl: null, paperworkNotRequired: false, state: documents.length ? 'filled' : 'missing', documents }) as OrderPacketLine;

const label = (id: number, state: LabelPrintRow['state'] = 'APPLIED'): LabelPrintRow => ({ id, state, carrier: 'UPS', trackingNumber: `1Z${id}` }) as LabelPrintRow;
const labelDoc = (documentId: number): PacketLabelDocument => ({ key: `doc:${documentId}`, documentId, title: `Label doc ${documentId}`, src: `/d/${documentId}` }) as PacketLabelDocument;

const packet = (over: { labels?: LabelPrintRow[]; labelDocs?: PacketLabelDocument[]; slips?: PaperworkDocumentRow[]; lines?: OrderPacketLine[] }): OrderPacket =>
  ({
    orderId: 10,
    orderRef: '113-1',
    label: { state: 'filled', labels: over.labels ?? [], documents: over.labelDocs ?? [], suggestions: [] },
    slip: { state: 'filled', documents: over.slips ?? [] },
    lines: over.lines ?? [],
  }) as unknown as OrderPacket;

const preview = (manualId: number): PreviewManual => ({ manualId, title: `Lib ${manualId}`, src: null, driveUrl: null, detail: null, origin: 'search' });

test('labels list ledger labels then label documents, numbered as boxes, held labels unfiled', () => {
  const items = linkedItems(packet({ labels: [label(1), label(2, 'QUARANTINED')], labelDocs: [labelDoc(7)] }), 'label');
  assert.deepEqual(
    items.map((item) => item.title),
    ['Box 1 · UPS label', 'Box 2 · UPS label', 'Box 3 · Label doc 7'],
  );
  assert.deepEqual(
    items.map((item) => (item.kind === 'label' ? item.filed : null)),
    [true, false, null],
  );
});

test('nothing selected shows the tab’s first document on file, else nothing', () => {
  const p = packet({ slips: [manual(1)] });
  assert.equal(resolveSelection(p, 'slip', null)?.key, 'manual:1');
  assert.equal(resolveSelection(p, 'label', null), null);
});

test('a selection from another tab does not leak into this one', () => {
  const p = packet({ labels: [label(1)], slips: [manual(4)] });
  assert.equal(resolveSelection(p, 'slip', { kind: 'label', ingestionId: 1 })?.key, 'manual:4');
});

test('a linked selection that went away (unpaired, unlinked) falls back to what is left', () => {
  const before = packet({ labels: [label(1), label(2)] });
  const second = linkedItems(before, 'label')[1]!;
  const selection = selectionOf(second);
  assert.equal(resolveSelection(before, 'label', selection)?.key, 'label:2');
  const after = packet({ labels: [label(1)] });
  assert.equal(resolveSelection(after, 'label', selection)?.key, 'label:1');
});

test('the same manual on two lines is two rows — each line selects its own', () => {
  const p = packet({ lines: [line(1, [manual(5)]), line(2, [manual(5)])] });
  const keys = linkedItems(p, 'paperwork').map((item) => item.key);
  assert.deepEqual(keys, ['1:manual:5', '2:manual:5']);
  assert.equal(resolveSelection(p, 'paperwork', { kind: 'paperwork', lineId: 2, key: 'manual:5' })?.key, '2:manual:5');
});

test('a preview is shown unlinked, then as the linked document once Link lands', () => {
  const selection = { kind: 'preview', lineId: 1, manual: preview(9) } as const;
  const unlinked = resolveSelection(packet({ lines: [line(1)] }), 'paperwork', selection);
  assert.equal(unlinked?.kind, 'preview');
  const linked = resolveSelection(packet({ lines: [line(1, [manual(9)])] }), 'paperwork', selection);
  assert.equal(linked?.kind, 'paperwork');
  assert.equal(linked?.key, '1:manual:9');
});

test('a preview for a line no longer on the order falls back', () => {
  const p = packet({ lines: [line(2, [manual(3)])] });
  assert.equal(resolveSelection(p, 'paperwork', { kind: 'preview', lineId: 1, manual: preview(9) })?.key, '2:manual:3');
});

test('the Link verb names its scope and reach', () => {
  assert.equal(linkVerbLabel('sku', { sku: '00822', itemNumber: null }, 3), 'Link to SKU 00822 · 3 open orders');
  assert.equal(linkVerbLabel('sku', { sku: '00822', itemNumber: null }, 1), 'Link to SKU 00822 · 1 open order');
  assert.equal(linkVerbLabel('sku', { sku: '00822', itemNumber: null }, null), 'Link to SKU 00822');
  assert.equal(linkVerbLabel('item_number', { sku: null, itemNumber: '1234' }, null), 'Link to Item # 1234');
  assert.equal(linkVerbLabel('order', { sku: null, itemNumber: null }, null), 'Link to this order');
});

test('label unpair confirm names the tracking that comes off and warns on a scan-out', () => {
  const when = (iso: string) => `@${iso}`;
  const plain = labelUnpairCopy({ trackingComesOff: ['1ZA', '1ZB'], scannedOut: null }, false, '113-1', when);
  assert.equal(plain.tone, 'primary');
  assert.match(plain.description, /Tracking 1ZA, 1ZB comes off the order\./);
  assert.doesNotMatch(plain.description, /Scanned out/);

  const scanned = labelUnpairCopy({ trackingComesOff: [], scannedOut: { at: 'T1', by: 'Ana' } }, false, '113-1', when);
  assert.equal(scanned.tone, 'danger');
  assert.match(scanned.description, /No tracking comes off/);
  assert.match(scanned.description, /Scanned out @T1 by Ana — the scan record stays\./);

  const remove = labelUnpairCopy({ trackingComesOff: [], scannedOut: null }, true, '113-1', when);
  assert.equal(remove.confirmLabel, 'Remove label');
  assert.equal(remove.tone, 'danger');
  assert.match(remove.description, /its file is deleted/);
});
