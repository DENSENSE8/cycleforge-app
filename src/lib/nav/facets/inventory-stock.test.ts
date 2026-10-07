import test from 'node:test';
import assert from 'node:assert/strict';
import { locationStockRoomId } from '@/lib/inventory/location-stock-row';
import { inventoryStockFacets, type StockScopeCountReader } from './inventory-stock';
import { getNavFacets, type NavFacetsDeps } from './service';

const ORG = '00000000-0000-0000-0000-000000000001';
const NO_COUNTS: StockScopeCountReader = async () => ({
  inStockPairs: 0,
  inStockProducts: 0,
  inStockUnits: 0,
  onHoldPairs: 0,
  lowStockPairs: 0,
  outPairs: 0,
  neverCountedPairs: 0,
});

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
  }, NO_COUNTS);

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
    NO_COUNTS,
  );

  assert.equal(result.total, 3);
  assert.deepEqual(result.groups.find((group) => group.id === 'room')?.options, [
    { value: 'Zone 3 - Parts', label: 'Zone 3 - Parts', count: 3 },
  ]);
  assert.deepEqual(result.groups.find((group) => group.id === 'aisle')?.options, [
    { value: '3', label: 'Aisle 3', count: 2 },
  ]);
});

test('stock health counts come from the list scope counts on the chip ids', async () => {
  const seen: Array<Parameters<StockScopeCountReader>[0]> = [];
  const result = await inventoryStockFacets(
    ORG,
    new URLSearchParams({ room: 'Zone 3 - Parts', aisle: '2', q: 'brake', status: 'low-stock' }),
    async () => [],
    async (args) => {
      seen.push(args);
      return { inStockPairs: 9, inStockProducts: 4, inStockUnits: 30, onHoldPairs: 1, lowStockPairs: 3, outPairs: 2, neverCountedPairs: 6 };
    },
  );

  assert.deepEqual(seen, [{
    orgId: ORG,
    room: 'Zone 3 - Parts',
    excludeRoom: null,
    aisle: '2',
    excludeAisle: null,
    query: 'brake',
  }]);
  const health = result.groups.find((group) => group.id === 'health');
  assert.equal(health?.param, 'status');
  assert.deepEqual(health?.options, [
    { value: 'in-stock', label: 'In stock', count: 9 },
    { value: 'low-stock', label: 'Low stock', count: 3 },
    { value: 'out-of-stock', label: 'Out of stock', count: 2 },
    { value: 'on-hold', label: 'On hold', count: 1 },
  ]);
  const count = result.groups.find((group) => group.id === 'count');
  assert.equal(count?.param, 'counted');
  assert.deepEqual(count?.options, [{ value: 'never', label: 'Never counted', count: 6 }]);
});

test('inventory stock facets require sku_stock.view', async () => {
  const deps: NavFacetsDeps = {
    run: async () => [],
    listLocalPickupLines: async () => [],
    exceptionCounts: async () => ({}),
    supportRows: async () => [],
    liveFeedFacets: async () => ({ carrier: [], channel: [] }),
  };
  const result = await getNavFacets(
    { orgId: ORG, permissions: new Set(['orders.view']) },
    'stock.all',
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
