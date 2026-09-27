import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyPoImportDraft,
  extractPoFields,
  mergePoDraft,
  poImportMissing,
  type PoImportLine,
} from './po-import-draft';

const line = (over: Partial<PoImportLine> = {}): PoImportLine => ({
  skuCatalogId: null,
  sku: '',
  title: '',
  quantity: null,
  unitCostCents: null,
  listingUrl: '',
  itemNumber: '',
  ...over,
});

test('a pasted vendor PO without tracking: PO #, vendor, items with qty and cost — no tracking lifted', () => {
  const x = extractPoFields(
    [
      'Purchase order PO-88412 from our supplier',
      'Vendor: Acme Audio Supply',
      '2 x SKU 00066-P-2 @ $45.50',
      'SKU: BOSE-151-BK qty 3 cost $12',
      'Expected: Oct 3',
      'Notes: leave at dock B',
    ].join('\n'),
  );
  assert.equal(x.poNumber, 'PO-88412');
  assert.equal(x.vendor, 'Acme Audio Supply');
  assert.deepEqual(x.tracking, []);
  assert.deepEqual(
    x.items.map((i) => [i.product, i.sku, i.quantity, i.unitCostCents]),
    [
      ['00066-P-2', true, 2, 4550],
      ['BOSE-151-BK', true, 3, 1200],
    ],
  );
  assert.equal(x.expected, 'Oct 3');
  assert.equal(x.notes, 'leave at dock B');
});

test('tracking: labelled numbers of any shape, carrier-shaped numbers unlabelled; listing digits never read as tracking', () => {
  const x = extractPoFields(
    'Tracking number is 1Z999AA10123456784 and EVPO12345678. Also 9400111899223344556677. https://www.ebay.com/itm/394857261834',
  );
  assert.deepEqual(
    x.tracking.map((t) => [t.number, t.carrier]),
    [
      ['1Z999AA10123456784', 'UPS'],
      ['EVPO12345678', 'Unknown'],
      ['9400111899223344556677', 'USPS'],
    ],
  );
  assert.deepEqual(x.listingUrls, []); // the link is its own item line
  assert.equal(x.items[0]?.listingUrl, 'https://www.ebay.com/itm/394857261834');
});

test('a word after "tracking" is not a tracking number; a PO number needs a digit', () => {
  const x = extractPoFields('No tracking yet, the PO number will follow');
  assert.deepEqual(x.tracking, []);
  assert.equal(x.poNumber, null);
});

test('follow-up answers: "quantity for line 2: 4" targets that line', () => {
  const x = extractPoFields('Quantity for line 2: 4');
  assert.deepEqual(x.lineQuantities, [{ line: 2, quantity: 4 }]);
  assert.deepEqual(x.items, []);
});

test('missing checklist: required fields in card order, a line without quantity is asked, never assumed', () => {
  const empty = poImportMissing(emptyPoImportDraft());
  assert.deepEqual(empty.map((n) => n.label), ['PO number', 'Vendor', 'Items', 'Tracking number']);

  const partial = mergePoDraft(emptyPoImportDraft(), {
    poNumber: 'po-1',
    vendor: 'Acme',
    lines: [line({ sku: 'A-1', title: 'Thing', quantity: 2 }), line({ sku: 'B-2', title: 'Other' })],
  });
  assert.equal(partial.poNumber, 'PO-1');
  assert.deepEqual(poImportMissing(partial).map((n) => n.label), ['Quantity for B-2', 'Tracking number']);
});

test('merge loop: a follow-up adds tracking and keeps every earlier field; the same number twice is one entry', () => {
  const first = mergePoDraft(emptyPoImportDraft(), {
    poNumber: 'PO-7',
    vendor: 'Acme',
    lines: [line({ sku: 'A-1', quantity: 1 })],
  });
  const t = { number: 'EVPO12345678', carrier: 'Unknown' };
  const second = mergePoDraft(first, { tracking: [t] });
  const third = mergePoDraft(second, { tracking: [t], notes: 'fragile' });
  assert.equal(third.poNumber, 'PO-7');
  assert.equal(third.vendor, 'Acme');
  assert.equal(third.lines.length, 1);
  assert.deepEqual(third.tracking, [t]);
  assert.equal(third.notes, 'fragile');
  assert.deepEqual(poImportMissing(third), []);
  assert.equal(first.tracking.length, 0, 'the base draft is never mutated');
});

test('merge: an unattached listing link fills the first line without one; new items replace the list', () => {
  const base = mergePoDraft(emptyPoImportDraft(), { lines: [line({ sku: 'A-1', quantity: 1 })] });
  const linked = mergePoDraft(base, {
    listingLines: [line({ listingUrl: 'https://www.ebay.com/itm/1234567', itemNumber: '1234567' })],
  });
  assert.equal(linked.lines.length, 1);
  assert.equal(linked.lines[0].itemNumber, '1234567');

  const replaced = mergePoDraft(linked, { lines: [line({ sku: 'Z-9', quantity: 5 })] });
  assert.deepEqual(replaced.lines.map((l) => l.sku), ['Z-9']);
});
