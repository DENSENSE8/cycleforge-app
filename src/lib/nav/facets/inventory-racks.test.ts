import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryRackFacets } from './inventory-racks';
import { getNavFacets, type NavFacetsDeps } from './service';

const ORG = '00000000-0000-0000-0000-000000000001';

test('rack room facet counts racks per derived room and the total follows ?room=', async () => {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const rows = [
    { room_id: 12, room_name: 'Zone 2 - Racks', n: 3 },
    { room_id: 4, room_name: 'Zone 10 - Overflow', n: 1 },
    { room_id: null, room_name: null, n: 2 },
  ];
  const run = async (sql: string, bind: readonly unknown[]) => {
    calls.push({ sql, params: bind });
    return rows;
  };

  const all = await inventoryRackFacets(ORG, new URLSearchParams(), run);
  assert.equal(all.context, 'inventory.racks');
  assert.equal(all.total, 6);
  assert.deepEqual(all.groups, [{
    id: 'room',
    label: 'Room',
    param: 'room',
    options: [
      { value: '12', label: 'Zone 2 - Racks', count: 3 },
      { value: '4', label: 'Zone 10 - Overflow', count: 1 },
    ],
  }]);

  const one = await inventoryRackFacets(ORG, new URLSearchParams({ room: '12' }), run);
  assert.equal(one.total, 3);
  assert.deepEqual(calls[0]?.params, [ORG]);
  assert.match(calls[0]!.sql, /location_kind = 'RACK'/);
});

test('rack room facets require sku_stock.view', async () => {
  const deps: NavFacetsDeps = {
    run: async () => [],
    listLocalPickupLines: async () => [],
    exceptionCounts: async () => ({}),
    supportRows: async () => [],
    liveFeedFacets: async () => ({ carrier: [], channel: [] }),
  };
  const result = await getNavFacets(
    { orgId: ORG, permissions: new Set(['orders.view']) },
    'inventory.racks',
    new URLSearchParams(),
    deps,
  );
  assert.deepEqual(result, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'sku_stock.view' });
});
