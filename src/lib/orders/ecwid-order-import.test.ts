import test from 'node:test';
import assert from 'node:assert/strict';
import { searchEcwidOrderImports } from './ecwid-order-import';

const orgId = 'org-test' as never;
const creds = async () => ({ storeId: 'tenant-store', apiToken: 'secret' });
const none = async () => new Set<string>();

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('a multi-line order imports every line with its unit price, buyer and ship-to', async () => {
  const result = await searchEcwidOrderImports(
    orgId,
    { query: '1002' },
    {
      resolveCredentials: creds,
      existingOrderNumbers: none,
      fetcher: async (input) => {
        assert.match(String(input), /tenant-store\/orders/);
        return response({
          items: [{
            orderNumber: '1002',
            email: 'ann@example.com',
            shippingPerson: { name: 'Ann Lee', phone: '555-0100', street: '1 Main St', city: 'Austin', stateOrProvinceCode: 'TX', postalCode: '78701', countryCode: 'US' },
            trackingNumber: '1Z999AA10123456784',
            items: [
              { sku: 'SKU-1', name: 'Widget', quantity: 2, price: 10.5 },
              { sku: 'SKU-2', name: 'Cable', quantity: 1, price: 4 },
            ],
          }],
        });
      },
    },
  );

  assert.equal(result.connected, true);
  const [order] = result.orders;
  assert.equal(order!.orderNumber, '1002');
  assert.deepEqual(order!.lines.map((l) => [l.title, l.sku, l.quantity, l.unitCents]), [
    ['Widget', 'SKU-1', 2, 1050],
    ['Cable', 'SKU-2', 1, 400],
  ]);
  assert.equal(order!.totalCents, 2500);
  assert.equal(order!.customer.name, 'Ann Lee');
  assert.equal(order!.customer.shipTo.city, 'Austin');
  assert.equal(order!.hasShipTo, true);
  assert.deepEqual(order!.trackingNumbers, ['1Z999AA10123456784']);
  assert.equal(order!.importedAs, null);
});

test('an order without a street address reads as a counter pickup; a known order is marked imported', async () => {
  const result = await searchEcwidOrderImports(
    orgId,
    { query: '1003' },
    {
      resolveCredentials: creds,
      existingOrderNumbers: async (_org, numbers) => new Set(numbers),
      fetcher: async () => response({ items: [{ orderNumber: '1003', email: 'b@example.com', items: [{ sku: 'SKU-9', name: 'Speaker', quantity: 1 }] }] }),
    },
  );
  const [order] = result.orders;
  assert.equal(order!.hasShipTo, false);
  assert.equal(order!.lines[0]!.unitCents, null);
  assert.equal(order!.totalCents, null);
  assert.equal(order!.importedAs, '1003');
});

test('no Ecwid connection answers connected:false without calling the store', async () => {
  const result = await searchEcwidOrderImports(orgId, { query: '1001' }, {
    resolveCredentials: async () => null,
    fetcher: async () => {
      throw new Error('must not fetch');
    },
  });
  assert.deepEqual(result, { connected: false, orders: [] });
});
