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
      { sku: 'WIDGET-1', name: 'Blue Widget', quantity: 2, unitPrice: 19.99, weightOz: 16, lineItemKey: null, orderItemId: null, upc: null, imageUrl: null, options: [], adjustment: false },
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

test('listShipments: sends the documented v1 filters and maps docs-shaped rows, skipping unparseable ones', async () => {
  const restore = stubFetch({
    '/shipments': {
      shipments: [
        {
          shipmentId: 33974374,
          orderId: 43945660,
          orderNumber: '100038-1',
          createDate: '2014-10-03T06:51:33.6270000',
          shipDate: '2014-10-03',
          trackingNumber: ' 9400111899561704681189 ',
          isReturnLabel: false,
          carrierCode: 'stamps_com',
          serviceCode: 'usps_first_class_mail',
          voided: false,
          voidDate: null,
          shipmentCost: 1.93,
          insuranceCost: 0,
        },
        { shipmentId: 33974375, orderNumber: '100028', trackingNumber: '', voided: true },
        { shipmentId: 'not-a-number', orderNumber: 'X' },
      ],
      total: 3,
      page: 1,
      pages: 2,
    },
  });
  const stubbed = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    urls.push(String(url));
    return stubbed(url, init);
  }) as typeof fetch;
  try {
    const client = createShipStationV1Client('k', 's', 'http://mock.local');
    const res = await client.listShipments({ createDateStart: '2026-09-01T00:00:00.000Z', page: 1, pageSize: 50 });
    const q = new URL(urls[0]).searchParams;
    assert.equal(new URL(urls[0]).pathname, '/shipments');
    assert.equal(q.get('createDateStart'), '2026-09-01T00:00:00.000Z');
    assert.equal(q.get('sortBy'), 'CreateDate');
    assert.equal(q.get('pageSize'), '50');
    assert.equal(q.has('shipDateStart'), false, 'unset filters are not sent');

    assert.equal(res.shipments.length, 2, 'the row with a non-numeric shipmentId is skipped, not fatal');
    assert.equal(res.pages, 2);
    assert.deepEqual(res.shipments[0], {
      shipmentId: 33974374,
      orderId: 43945660,
      orderNumber: '100038-1',
      createDate: '2014-10-03T06:51:33.6270000',
      shipDate: '2014-10-03',
      trackingNumber: '9400111899561704681189',
      carrierCode: 'stamps_com',
      serviceCode: 'usps_first_class_mail',
      isReturnLabel: false,
      voided: false,
      shipmentCost: 1.93,
      insuranceCost: 0,
    });
    assert.equal(res.shipments[1].voided, true);
    assert.equal(res.shipments[1].trackingNumber, null, 'blank tracking degrades to null');
    assert.equal(res.shipments[1].orderId, null);
  } finally {
    globalThis.fetch = stubbed;
    restore();
  }
});

test('listStores: v1 answers a bare array; inactive stores are requested and flagged', async () => {
  const restore = stubFetch({
    '/stores': [
      { storeId: 246252, storeName: 'New Ecwid by Lightspeed Store', marketplaceId: 92, marketplaceName: 'Ecwid by Lightspeed', active: true },
      { storeId: 216557, storeName: 'New eBay Store', marketplaceId: 144, marketplaceName: 'eBay', active: false },
    ],
  });
  const stubbed = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    urls.push(String(url));
    return stubbed(url, init);
  }) as typeof fetch;
  try {
    const stores = await createShipStationV1Client('k', 's', 'http://mock.local').listStores();
    assert.equal(new URL(urls[0]).searchParams.get('showInactive'), 'true');
    assert.deepEqual(
      stores.map((s) => [s.storeId, s.marketplaceId, s.marketplaceName, s.active]),
      [
        [246252, 92, 'Ecwid by Lightspeed', true],
        [216557, 144, 'eBay', false],
      ],
    );
  } finally {
    globalThis.fetch = stubbed;
    restore();
  }
});

test('listOrders: keeps the full order detail (money, dates, notes, gift, service, lines, split flag)', async () => {
  const restore = stubFetch({
    '/orders': {
      orders: [
        {
          orderId: 318121813,
          orderNumber: '100602',
          orderKey: 'bba48a9d',
          orderDate: '2026-09-01T07:09:35.1400000',
          paymentDate: '2026-09-01T10:02:29.0000000',
          shipByDate: '2026-09-03T00:00:00.0000000',
          orderStatus: 'shipped',
          amountPaid: 25.5,
          taxAmount: 1.5,
          shippingAmount: 4,
          customerNotes: ' leave at door ',
          internalNotes: 'fragile',
          gift: true,
          giftMessage: 'Happy birthday',
          requestedShippingService: 'Standard',
          dimensions: { units: 'inches', length: 16, width: 12, height: 6 },
          advancedOptions: { storeId: 213534, source: null, mergedOrSplit: true },
          items: [
            {
              sku: 'A-1',
              name: 'Speaker',
              quantity: 2,
              unitPrice: 10,
              lineItemKey: '123-LINE',
              orderItemId: 9,
              options: [{ name: 'Color', value: 'Black' }],
            },
            { sku: null, name: 'Discount', quantity: 1, unitPrice: -2, adjustment: true },
          ],
        },
      ],
      total: 1,
      page: 1,
      pages: 1,
    },
  });
  try {
    const [order] = (await createShipStationV1Client('k', 's', 'http://mock.local').listOrders()).orders;
    assert.equal(order.amountPaid, 25.5);
    assert.equal(order.paymentDate, '2026-09-01T10:02:29.0000000');
    assert.equal(order.shipByDate, '2026-09-03T00:00:00.0000000');
    assert.equal(order.customerNotes, 'leave at door');
    assert.equal(order.gift, true);
    assert.equal(order.requestedShippingService, 'Standard');
    assert.equal(order.mergedOrSplit, true);
    assert.deepEqual(order.dimensions, { length: 16, width: 12, height: 6, units: 'inches' });
    assert.equal(order.items.length, 2);
    assert.deepEqual(order.items[0].options, [{ name: 'Color', value: 'Black' }]);
    assert.equal(order.items[0].lineItemKey, '123-LINE');
    assert.equal(order.items[1].adjustment, true);
  } finally {
    restore();
  }
});
