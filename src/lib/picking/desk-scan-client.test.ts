import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import type { ActiveStationOrder } from '@/hooks/station/types';
import type { ShippedOrder } from '@/types/orders';
import {
  addDeskSerial,
  deskOrderFromQueueRow,
  removeOrderSerials,
  resolveDeskScanType,
  scanDeskTracking,
  undoLastDeskStep,
} from './desk-scan-client';

function card(overrides: Partial<ActiveStationOrder> = {}): ActiveStationOrder {
  return {
    id: 42,
    orderId: '07-15231-87841',
    salId: 900,
    productTitle: 'Bracket',
    itemNumber: null,
    sku: '00713',
    condition: 'New',
    notes: '',
    tracking: '9400150206217936950528',
    serialNumbers: [],
    testDateTime: null,
    testedBy: null,
    quantity: 1,
    ...overrides,
  };
}

const realFetch = globalThis.fetch;
const calls: { url: string; body: Record<string, unknown> }[] = [];

function stubFetch(answer: Record<string, unknown>) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  calls.length = 0;
});

describe('resolveDeskScanType', () => {
  it('a USPS 420+ZIP label is a label, with or without a card short on serials', () => {
    const label = '420913049400150206217936950528';
    assert.equal(resolveDeskScanType(label, null), 'TRACKING');
    assert.equal(resolveDeskScanType(label, card()), 'TRACKING');
  });

  it('a unit serial and a bin SKU code route to their own verbs against the card', () => {
    assert.equal(resolveDeskScanType('019158900240341AC', card()), 'SERIAL');
    assert.equal(resolveDeskScanType('1809:A03', card()), 'SKU');
  });
});

describe('scanDeskTracking', () => {
  it('sends the label stripped of its USPS routing prefix and maps the card', async () => {
    stubFetch({
      found: true,
      orderFound: true,
      salId: 77,
      scanSessionId: 's-1',
      order: { ...card(), id: 42, serialNumbers: ['SN1'], quantity: '2' },
    });
    const result = await scanDeskTracking('420913049400150206217936950528', { idempotencyKey: 'k' });
    assert.equal(calls[0].url, '/api/picking/desk/scan');
    assert.equal(calls[0].body.value, '9400150206217936950528');
    assert.ok(result.ok);
    assert.equal(result.order.salId, 77);
    assert.equal(result.order.quantity, 2);
    assert.equal(result.message, 'Order loaded: 1 serial already scanned');
  });

  it('an exception hold loads the card without a success line', async () => {
    stubFetch({ found: true, orderFound: false, salId: 5, warning: 'Not found.', order: { ...card(), id: null } });
    const result = await scanDeskTracking('9400150206217936950528', { idempotencyKey: 'k' });
    assert.ok(result.ok);
    assert.equal(result.message, null);
    assert.equal(result.order.sourceType, 'exception');
    assert.equal(result.order.inlineMicrocopy, 'Not found.');
  });
});

describe('addDeskSerial', () => {
  it('refuses an ambiguous partial serial before writing', async () => {
    stubFetch({ success: true });
    const result = await addDeskSerial({
      input: 'AB12',
      contextOrder: card({ serialNumbers: ['XXAB12YY', 'ZZAB12QQ'], quantity: 3 }),
      scanSessionId: null,
      idempotencyKey: 'k',
    });
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
  });

  it('posts `add` on the card anchor and surfaces the pick warning', async () => {
    stubFetch({ success: true, serialNumbers: ['SN9'], attachedToOrder: true, pickWarning: 'Unit held by another order' });
    const result = await addDeskSerial({
      input: 'sn9',
      contextOrder: card(),
      scanSessionId: null,
      idempotencyKey: 'k',
      correlation: { clientEventId: 'scan-1', mobileScanEventId: 41 },
    });
    assert.equal(calls[0].body.action, 'add');
    assert.equal(calls[0].body.salId, 900);
    assert.equal(calls[0].body.scanClientEventId, 'scan-1');
    assert.equal(calls[0].body.mobileScanEventId, 41);
    assert.ok(result.ok);
    assert.deepEqual(result.order?.serialNumbers, ['SN9']);
    assert.equal(result.pickWarning, 'Unit held by another order');
  });

  it('without a card posts `add-to-last`', async () => {
    stubFetch({ success: true, serialNumbers: ['SN9'], order: null });
    const result = await addDeskSerial({ input: 'SN9', contextOrder: null, scanSessionId: null, idempotencyKey: 'k' });
    assert.equal(calls[0].body.action, 'add-to-last');
    assert.ok(result.ok);
    assert.equal(result.order, null);
  });
});

describe('undoLastDeskStep', () => {
  it('drops the newest serial while the card has one', async () => {
    stubFetch({ success: true, serialNumbers: ['SN1'], removedSerial: 'SN2', unpicked: null });
    const result = await undoLastDeskStep({ order: card({ serialNumbers: ['SN1', 'SN2'] }), idempotencyKey: 'k' });
    assert.equal(calls[0].url, '/api/picking/desk/serial');
    assert.equal(calls[0].body.action, 'undo');
    assert.ok(result.ok);
    assert.equal(result.undone, 'serial');
    assert.deepEqual(result.order?.serialNumbers, ['SN1']);
  });

  it('with no serials left undoes the label scan itself', async () => {
    stubFetch({ success: true, deletedSerials: 0 });
    const result = await undoLastDeskStep({ order: card(), idempotencyKey: 'k' });
    assert.equal(calls[0].url, '/api/picking/desk/delete');
    assert.equal(calls[0].body.salId, 900);
    assert.ok(result.ok);
    assert.equal(result.undone, 'label');
    assert.equal(result.order, null);
  });
});

describe('deskOrderFromQueueRow', () => {
  it('a reopened order starts with every serial already saved on it (legacy CSV rows split, deduped)', () => {
    const row = { id: 19955, order_id: 'CF-TEST-PH-000001', sku: 'TMP-1', quantity: '2', serial_number: '123456, sn-2,SN-2' } as unknown as ShippedOrder;
    const order = deskOrderFromQueueRow(row);
    assert.deepEqual(order.serialNumbers, ['123456', 'SN-2']);
    assert.equal(order.salId, null);
  });
});

describe('removeOrderSerials', () => {
  it('drops each serial off the ORDER and answers its remaining serials', async () => {
    const seen: { url: string; method?: string; body: unknown }[] = [];
    const answers = [['SN-2'], []];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ success: true, serialNumbers: answers[seen.length - 1], unpickedUnits: 1 }), { status: 200 });
    }) as typeof fetch;
    const result = await removeOrderSerials(19955, ['SN-1', 'SN-2']);
    assert.deepEqual(seen.map((c) => [c.url, c.method, c.body]), [
      ['/api/orders/19955/serials', 'DELETE', { serial: 'SN-1' }],
      ['/api/orders/19955/serials', 'DELETE', { serial: 'SN-2' }],
    ]);
    assert.ok(result.ok);
    assert.deepEqual(result.serialNumbers, []);
    assert.equal(result.unpickedUnits, 2);
  });

  it('stops at the first refusal and says which serial', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, error: 'order not found' }), { status: 404 })) as typeof fetch;
    const result = await removeOrderSerials(1, ['SN-1', 'SN-2']);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error, 'order not found');
  });
});
