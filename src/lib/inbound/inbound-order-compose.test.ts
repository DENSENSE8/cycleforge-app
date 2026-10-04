import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addInboundTracking,
  appendInboundLine,
  formatInboundMoney,
  inboundLineCatalogPatch,
  inboundLineName,
  inboundLineSkuPatch,
  inboundOrderCostTotal,
  inboundPriorityChoices,
  openableListingUrl,
  parseInboundQuantityInput,
  patchInboundLine,
  removeInboundLine,
  removeInboundTracking,
} from './inbound-order-compose';
import { emptyInboundOrderDraft, emptyInboundOrderLine, inboundOrderMissing } from './inbound-order-draft';

test('typed quantity: whole 1..10 000 only; anything else is "not said yet"', () => {
  assert.equal(parseInboundQuantityInput(' 3 '), 3);
  assert.equal(parseInboundQuantityInput('10000'), 10_000);
  for (const raw of ['', '0', '-1', '1.5', 'two', '10001']) assert.equal(parseInboundQuantityInput(raw), null, raw);
});

test('priority choices: Auto first, then the shared 0..3 tiers escalating to Priority', () => {
  const choices = inboundPriorityChoices();
  assert.deepEqual(choices.map((c) => c.value), ['auto', '3', '2', '1', '0']);
  assert.equal(choices.at(-1)?.label, 'Priority');
});

test('a catalog pick names the line; clearing it keeps the typed text; a new SKU unpairs', () => {
  const line = { ...emptyInboundOrderLine(), sku: 'old', title: 'Typed' };
  assert.deepEqual(inboundLineCatalogPatch(line, { id: 9, sku: 'CAT-9', product_title: 'Catalog nine' }), {
    skuCatalogId: 9, sku: 'CAT-9', title: 'Catalog nine',
  });
  assert.deepEqual(inboundLineCatalogPatch(line, null), { skuCatalogId: null });
  const paired = { ...line, sku: 'CAT-9', skuCatalogId: 9 };
  assert.deepEqual(inboundLineSkuPatch(paired, 'CAT-9'), { sku: 'CAT-9', skuCatalogId: 9 });
  assert.deepEqual(inboundLineSkuPatch(paired, 'CAT-10'), { sku: 'CAT-10', skuCatalogId: null });
});

test('lines: the blank starter line is replaced, removal keeps one line, patches touch one index', () => {
  const blank = emptyInboundOrderDraft('PO');
  const first = appendInboundLine(blank, { ...emptyInboundOrderLine(), title: 'Fan', quantity: 2 });
  assert.equal(first.draft.lines.length, 1);
  assert.equal(first.index, 0);
  const second = appendInboundLine(first.draft, { ...emptyInboundOrderLine(), sku: 'B-2', quantity: 1 });
  assert.equal(second.index, 1);
  const patched = patchInboundLine(second.draft, 1, { quantity: 5 });
  assert.equal(patched.lines[1].quantity, 5);
  assert.equal(patched.lines[0].quantity, 2);
  const removed = removeInboundLine(removeInboundLine(patched, 0), 0);
  assert.equal(removed.lines.length, 1);
  assert.equal(inboundLineName(removed.lines[0]), 'Untitled item');
  assert.equal(inboundLineName({ title: ' ', sku: 'B-2' }), 'B-2');
});

test('tracking: a scan fills the empty slot, repeats are ignored, removal keeps one slot', () => {
  const d0 = emptyInboundOrderDraft('PO');
  const d1 = addInboundTracking(d0, ' 1Z999AA10123456784 ');
  assert.deepEqual(d1.tracking, [{ number: '1Z999AA10123456784', carrier: '' }]);
  assert.equal(addInboundTracking(d1, '1Z999AA10123456784'), d1);
  const d2 = addInboundTracking(d1, '9400111899223197428490');
  assert.equal(d2.tracking.length, 2);
  assert.deepEqual(removeInboundTracking(removeInboundTracking(d2, 0), 0).tracking, [{ number: '', carrier: '' }]);
});

test('cost: subtotal of costed lines, count of uncosted; money never guesses', () => {
  const draft = {
    ...emptyInboundOrderDraft('PO'),
    lines: [
      { ...emptyInboundOrderLine(), title: 'A', quantity: 2, unitCostCents: 250 },
      { ...emptyInboundOrderLine(), title: 'B', quantity: 1, unitCostCents: null },
    ],
  };
  assert.deepEqual(inboundOrderCostTotal(draft), { subtotalCents: 500, missingCost: 1 });
  assert.equal(formatInboundMoney(500, 'USD'), '$5.00');
  assert.equal(formatInboundMoney(null, 'USD'), '$—');
  assert.equal(openableListingUrl('javascript:alert(1)'), null);
  assert.equal(openableListingUrl('https://ebay.com/itm/1'), 'https://ebay.com/itm/1');
});

test('a phone-built Goodwill PO is ready exactly when inboundOrderMissing is empty', () => {
  let draft = { ...emptyInboundOrderDraft('PO'), platform: 'goodwill', priority: '3' as const };
  assert.deepEqual(inboundOrderMissing(draft).map((n) => n.field), ['order_number', 'lines']);
  draft = { ...draft, orderNumber: 'GW-SYN-1' };
  draft = appendInboundLine(draft, { ...emptyInboundOrderLine(), title: 'Shimano derailleur', quantity: null }).draft;
  assert.deepEqual(inboundOrderMissing(draft).map((n) => n.field), ['quantity']);
  draft = patchInboundLine(draft, 0, { quantity: parseInboundQuantityInput('1') });
  assert.deepEqual(inboundOrderMissing(draft), []);
});
