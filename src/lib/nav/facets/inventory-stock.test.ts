import test from 'node:test';
import assert from 'node:assert/strict';
import { locationStockRoomId } from '@/lib/inventory/location-stock-row';
import { inventoryStockFacets } from './inventory-stock';
import { getNavFacets, type NavFacetsDeps } from './service';

const ORG = '00000000-0000-0000-0000-000000000001';

test('stock room and aisle facets cross-filter with comma-safe room ids', async () => {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const room = 'Zone 4 - Wall Mounts, Claims, RS';
  const roomId = locationStockRoomId({ room });
  const params = new URLSearchParams({ room: roomId, aisle: '10,2' });
  const result = await inventoryStockFacets(ORG, params, async (sql, bind) => {
    calls.push({ sql, params: bind });
    return [
      { room, aisle: 1, n: 12 },
      { room, aisle: 2, n: 7 },
      { room, aisle: 10, n: 1 },
      { room: 'Zone 3 - Parts', aisle: 2, n: 5 },
    ];
  });

  assert.equal(result.total, 8);
  assert.deepEqual(result.groups.find((group) => group.id === 'room')?.options, [
    { value: 'Zone 3 - Parts', label: 'Zone 3 - Parts', count: 5 },
    { value: roomId, label: room, count: 8 },
  ]);
  assert.deepEqual(result.groups.find((group) => group.id === 'aisle')?.options, [
    { value: '1', label: 'Aisle 1', count: 12 },
    { value: '2', label: 'Aisle 2', count: 7 },
    { value: '10', label: 'Aisle 10', count: 1 },
  ]);
  assert.deepEqual(calls[0]?.params, [ORG]);
});

test('room counts include barcoded locations without a numeric aisle', async () => {
  const result = await inventoryStockFacets(
    ORG,
    new URLSearchParams({ room: 'Zone 3 - Parts' }),
    async () => [
      { room: 'Zone 3 - Parts', aisle: null, n: 1 },
      { room: 'Zone 3 - Parts', aisle: 3, n: 2 },
    ],
  );

  assert.equal(result.total, 3);
  assert.deepEqual(result.groups.find((group) => group.id === 'room')?.options, [
    { value: 'Zone 3 - Parts', label: 'Zone 3 - Parts', count: 3 },
  ]);
  assert.deepEqual(result.groups.find((group) => group.id === 'aisle')?.options, [
    { value: '3', label: 'Aisle 3', count: 2 },
  ]);
});

test('inventory stock facets require sku_stock.view', async () => {
  const deps: NavFacetsDeps = {
    run: async () => [],
    listLocalPickupLines: async () => [],
    exceptionCounts: async () => ({}),
    liveFeedCounts: async () => ({}),
  };
  const result = await getNavFacets(
    { orgId: ORG, permissions: new Set(['orders.view']) },
    'inventory.stock',
    new URLSearchParams(),
    deps,
  );
  assert.deepEqual(result, {
    ok: false,
    status: 403,
    error: 'FORBIDDEN',
    permission: 'sku_stock.view',
  });
});
