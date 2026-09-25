import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comparePaperwork,
  defaultPairScope,
  mergePairing,
  PaperworkPairingError,
  paperworkSources,
  parsePairScope,
  parsePaperworkPairing,
  scopePairing,
  type OrderPaperworkKeys,
  type PaperworkPairing,
} from './paperwork-pairing';

const KEYS: OrderPaperworkKeys = { orderId: 42, itemKey: 'B00CD1PTF0', skuKey: '01103', skuCatalogId: 7 };
const NONE: PaperworkPairing = { orderId: null, itemNumber: null, sku: null, skuCatalogId: null };

test('a row resolves under every key it matches, most specific first', () => {
  assert.deepEqual(
    paperworkSources({ orderId: 42, itemNumber: 'b00cd1ptf0', sku: '01103', skuCatalogId: null }, KEYS),
    ['order', 'item_number', 'sku'],
  );
});

test('item numbers match on the normalized key; SKUs keep leading zeros', () => {
  assert.deepEqual(paperworkSources({ ...NONE, itemNumber: ' 00b00-cd1ptf0 ' }, KEYS), ['item_number']);
  assert.deepEqual(paperworkSources({ ...NONE, sku: '1103' }, KEYS), []);
  assert.deepEqual(paperworkSources({ ...NONE, sku: '01-103' }, KEYS), ['sku']);
});

test('the catalog SKU identity pairs even when the raw SKU string differs', () => {
  assert.deepEqual(paperworkSources({ ...NONE, sku: 'EBAY-VARIANT', skuCatalogId: 7 }, KEYS), ['sku']);
  assert.deepEqual(paperworkSources({ ...NONE, skuCatalogId: 8 }, KEYS), []);
});

test('another order, and an order without keys, resolve nothing', () => {
  assert.deepEqual(paperworkSources({ ...NONE, orderId: 43 }, KEYS), []);
  const bare: OrderPaperworkKeys = { orderId: 42, itemKey: '', skuKey: '', skuCatalogId: null };
  assert.deepEqual(paperworkSources({ ...NONE, itemNumber: '', sku: '' }, bare), []);
  assert.deepEqual(paperworkSources({ ...NONE, orderId: 42 }, bare), ['order']);
});

test('precedence orders order > item number > SKU, newest first within a source', () => {
  const rows = [
    { id: 1, source: 'sku' as const, updatedAt: '2026-09-24T12:00:00Z' },
    { id: 2, source: 'item_number' as const, updatedAt: '2026-09-01T00:00:00Z' },
    { id: 3, source: 'item_number' as const, updatedAt: '2026-09-20T00:00:00Z' },
    { id: 4, source: 'order' as const, updatedAt: '2026-01-01T00:00:00Z' },
    { id: 5, source: 'item_number' as const, updatedAt: '2026-09-20T00:00:00Z' },
  ];
  assert.deepEqual(rows.sort(comparePaperwork).map((r) => r.id), [4, 5, 3, 2, 1]);
});

test('re-pair validation stores the item key and refuses empty or junk keys', () => {
  assert.deepEqual(parsePaperworkPairing({ orderId: null, itemNumber: ' 00b00-cd1 ', sku: '  01103 ' }), {
    orderId: null,
    itemNumber: 'B00CD1',
    sku: '01103',
  });
  assert.deepEqual(parsePaperworkPairing({ orderId: 42 }), { orderId: 42, itemNumber: null, sku: null });
  const refuses = (input: unknown, message: RegExp) =>
    assert.throws(() => parsePaperworkPairing(input), (e: unknown) => e instanceof PaperworkPairingError && message.test(e.message));
  refuses({ itemNumber: '', sku: '  ' }, /or unpair/);
  refuses({ itemNumber: '000' }, /Item number needs a letter or digit/);
  refuses({ sku: '--' }, /SKU needs a letter or digit/);
  refuses({ orderId: 0 }, /positive integer/);
  refuses({ orderId: 'abc' }, /positive integer/);
  refuses({ sku: 5 }, /sku must be a string/);
  refuses({ sku: 'x'.repeat(101) }, /longer than 100/);
  refuses(null, /must be an object/);
});

test('scoped pairs pin exactly one key and refuse a key the order lacks', () => {
  const order = { orderId: 42, itemNumber: 'B00CD1PTF0', sku: '01103' };
  assert.deepEqual(scopePairing('order', order), { orderId: 42, itemNumber: null, sku: null });
  assert.deepEqual(scopePairing('item_number', order), { orderId: null, itemNumber: 'B00CD1PTF0', sku: null });
  assert.deepEqual(scopePairing('sku', order), { orderId: null, itemNumber: null, sku: '01103' });
  assert.throws(() => scopePairing('item_number', { ...order, itemNumber: null }), /no item number/);
  assert.throws(() => scopePairing('sku', { ...order, sku: ' ' }), /no SKU/);
});

test('the default scope is the recurring key the order has', () => {
  assert.equal(defaultPairScope({ itemNumber: 'B00CD1PTF0', sku: '01103' }), 'item_number');
  assert.equal(defaultPairScope({ itemNumber: '000', sku: '01103' }), 'sku');
  assert.equal(defaultPairScope({ itemNumber: null, sku: null }), 'order');
  assert.equal(parsePairScope(''), null);
  assert.equal(parsePairScope('sku'), 'sku');
  assert.throws(() => parsePairScope('catalog'), PaperworkPairingError);
});

test('pairing a library row from an order adds the scoped key and keeps the rest', () => {
  assert.deepEqual(
    mergePairing({ orderId: null, itemNumber: '000799', sku: 'BOSE-1' }, { orderId: 42, itemNumber: null, sku: null }),
    { orderId: 42, itemNumber: '799', sku: 'BOSE-1' },
  );
  assert.deepEqual(
    mergePairing({ orderId: 9, itemNumber: '799', sku: null }, { orderId: null, itemNumber: 'B00CD1PTF0', sku: null }),
    { orderId: 9, itemNumber: 'B00CD1PTF0', sku: null },
  );
});
