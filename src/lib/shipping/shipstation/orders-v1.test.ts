import test from 'node:test';
import assert from 'node:assert/strict';
import { createShipStationV1Client } from './orders-v1';

/**
 * DB-free unit tests for the v1 client's raw→normalized MAPPING (mirrors
 * client.test.ts): `fetch` is stubbed with a docs-shaped v1 /orders payload;
 * no network, no DB. The buyer-identity fields (customerId, billTo,
 * countryCode alias) are the ones the customer-book sync depends on.
 * Run: npx tsx --test src/lib/shipping/shipstation/orders-v1.test.ts
 */

function stubFetch(routes: Record<string, unknown>): () => void {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    for (const [prefix, body] of Object.entries(routes)) {
      if (path.startsWith(prefix)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return new Response(JSON.stringify({ message: `unmocked ${path}` }), { status: 404 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

/** A /orders payload shaped like ShipStation's documented v1 model. */
const v1OrderPayload = (over: Record<string, unknown> = {}) => ({
  orders: [
    {
      orderId: 93348442,
      orderNumber: 'TEST-ORDER-1001',
      orderDate: '2026-09-20T08:46:27Z',
      modifyDate: '2026-09-21T16:03:06Z',
      orderStatus: 'awaiting_shipment',
      customerId: 37701499,
      customerUsername: 'buyer@example.com',
      customerEmail: 'buyer@example.com',
      billTo: {
        name: 'Jane Doe',
        street1: '123 Main St',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        countryCode: 'US',
        phone: '555-0199',
        residential: true,
      },
      shipTo: {
        name: 'Jane Doe',
        company: 'Example Inc',
        street1: '123 Main St',
        street2: 'Suite 200',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
        phone: '555-0199',
        residential: true,
      },
      items: [
        {
          sku: 'WIDGET-1',
          name: 'Blue Widget',
          quantity: 2,
          unitPrice: 19.99,
          weight: { value: 16, units: 'ounces' },
        },
      ],
      orderTotal: 39.98,
      weight: { value: 32, units: 'ounces' },
      ...over,
    },
  ],
  total: 1,
  page: 1,
  pages: 1,
});

test('listOrders: maps buyer identity (customerId, email, billTo) onto the normalized order', async () => {
  const restore = stubFetch({ '/orders': v1OrderPayload() });
  try {
    const client = createShipStationV1Client('k', 's', 'http://mock.local');
    const res = await client.listOrders();
    assert.equal(res.orders.length, 1);
    const order = res.orders[0];
    assert.equal(order.customerId, 37701499, 'customerId captured (tier-1 buyer dedupe key)');
    assert.equal(order.customerUsername, 'buyer@example.com');
    assert.equal(order.customerEmail, 'buyer@example.com');
    assert.ok(order.billTo, 'billTo captured, not just shipTo');
    assert.equal(order.billTo?.addressLine1, '123 Main St');
    assert.ok(order.shipTo);
    assert.equal(order.shipTo?.addressLine2, 'Suite 200');
    assert.equal(order.shipTo?.company, 'Example Inc');
    assert.deepEqual(order.items, [
      { sku: 'WIDGET-1', name: 'Blue Widget', quantity: 2, unitPrice: 19.99, weightOz: 16 },
    ]);
  } finally {
    restore();
  }
});

test('listOrders: address country falls back to countryCode when country is absent', async () => {
  const payload = v1OrderPayload();
  delete (payload.orders[0].shipTo as Record<string, unknown>).country;
  const restore = stubFetch({ '/orders': payload });
  try {
    const client = createShipStationV1Client('k', 's', 'http://mock.local');
    const res = await client.listOrders();
    assert.equal(res.orders[0].shipTo?.countryCode, 'US', 'countryCode alias honored');
  } finally {
    restore();
  }
});

test('listOrders: null customerId / missing billTo degrade to null, not a parse failure', async () => {
  const restore = stubFetch({
    '/orders': v1OrderPayload({ customerId: null, billTo: undefined, customerEmail: null }),
  });
  try {
    const client = createShipStationV1Client('k', 's', 'http://mock.local');
    const res = await client.listOrders();
    const order = res.orders[0];
    assert.equal(order.customerId, null);
    assert.equal(order.customerEmail, null);
    assert.equal(order.billTo, null);
    assert.equal(order.orderStatus, 'awaiting_shipment');
  } finally {
    restore();
  }
});

test('getOrderByNumber: returns the mapped order for the first hit', async () => {
  const restore = stubFetch({ '/orders': v1OrderPayload() });
  try {
    const client = createShipStationV1Client('k', 's', 'http://mock.local');
    const order = await client.getOrderByNumber('TEST-ORDER-1001');
    assert.ok(order);
    assert.equal(order?.customerId, 37701499);
    assert.equal(order?.shipTo?.phone, '555-0199');
  } finally {
    restore();
  }
});

test('listOrders: advancedOptions store + marketplace map onto the order channel fields', async () => {
  const restore = stubFetch({
    '/orders': v1OrderPayload({ advancedOptions: { storeId: 100247, source: 'eBay' } }),
  });
  try {
    const client = createShipStationV1Client('k', 's', 'http://mock.local');
    const res = await client.listOrders();
    assert.equal(res.orders[0].storeId, 100247, 'storeId captured for store resolution');
    assert.equal(res.orders[0].marketplace, 'eBay', 'marketplace captured for channel resolution');
  } finally {
    restore();
  }
});

test('listOrders: absent advancedOptions degrade store/marketplace to null', async () => {
  const restore = stubFetch({ '/orders': v1OrderPayload() });
  try {
    const client = createShipStationV1Client('k', 's', 'http://mock.local');
    const res = await client.listOrders();
    assert.equal(res.orders[0].storeId, null);
    assert.equal(res.orders[0].marketplace, null);
  } finally {
    restore();
  }
});

test('listStores: maps the connected storefronts and their marketplaces', async () => {
  const restore = stubFetch({
    '/stores': {
      stores: [
        { storeId: 100247, storeName: 'USAV eBay', marketplace: 'eBay', marketplaceName: 'eBay' },
        { storeId: 100248, storeName: 'Webstore', marketplace: 'Shopify', marketplaceName: 'Shopify' },
        { storeId: 100249, storeName: null, marketplace: null, marketplaceName: null },
      ],
    },
  });
  try {
    const client = createShipStationV1Client('k', 's', 'http://mock.local');
    const stores = await client.listStores();
    assert.equal(stores.length, 3);
    assert.equal(stores[0].marketplace, 'eBay');
    assert.equal(stores[1].storeId, 100248);
    assert.equal(stores[2].marketplace, null, 'a store with no marketplace degrades, never throws');
  } finally {
    restore();
  }
});
