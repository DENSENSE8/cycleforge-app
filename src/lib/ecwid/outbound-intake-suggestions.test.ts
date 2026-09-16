import test from 'node:test';
import assert from 'node:assert/strict';
import { getOutboundIntakeSuggestions } from './outbound-intake-suggestions';

const orgId = 'org-test' as never;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('returns a safe single-line Ecwid order draft with all canonical identity fields', async () => {
  const result = await getOutboundIntakeSuggestions(
    orgId,
    { query: '1001', kind: 'orders' },
    {
      resolveCredentials: async () => ({ storeId: 'tenant-store', apiToken: 'secret' }),
      fetcher: async (input) => {
        assert.match(String(input), /tenant-store\/orders/);
        return response({ items: [{ orderNumber: '1001', items: [{ sku: 'SKU-1', name: 'Widget', quantity: 2 }] }] });
      },
    },
  );

  assert.equal(result.connected, true);
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].draft.orderNumber, '1001');
  assert.equal(result.suggestions[0].draft.productTitle, 'Widget');
  assert.equal(result.suggestions[0].draft.quantity, '2');
});

test('does not offer a lossy draft for a multi-line Ecwid order', async () => {
  const result = await getOutboundIntakeSuggestions(
    orgId,
    { query: '1002', kind: 'orders' },
    {
      resolveCredentials: async () => ({ storeId: 'tenant-store', apiToken: 'secret' }),
      fetcher: async () => response({ items: [{ orderNumber: '1002', items: [
        { sku: 'SKU-1', name: 'Widget', quantity: 1 },
        { sku: 'SKU-2', name: 'Cable', quantity: 1 },
      ] }] }),
    },
  );

  assert.deepEqual(result.suggestions[0].draft, {});
  assert.match(result.suggestions[0].unavailableReason ?? '', /separately/i);
});

test('returns product suggestions without inventing an order number', async () => {
  const result = await getOutboundIntakeSuggestions(
    orgId,
    { query: 'widget', kind: 'products' },
    {
      resolveCredentials: async () => ({ storeId: 'tenant-store', apiToken: 'secret' }),
      fetcher: async () => response({ items: [{ id: 44, name: 'Widget', sku: 'SKU-44' }] }),
    },
  );

  assert.equal(result.suggestions[0].draft.productTitle, 'Widget');
  assert.equal(result.suggestions[0].draft.itemNumber, '44');
  assert.equal(result.suggestions[0].draft.orderNumber, undefined);
});
