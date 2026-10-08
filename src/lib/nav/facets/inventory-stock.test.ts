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
});

const ZONE_4 = 'Zone 4 - Wall Mounts, Claims, RS';
const ZONE_3 = 'Zone 3 - Parts';
/** Two rooms that both have an Aisle 2 — the reason an aisle needs its room. */
const ADDRESSES = [
  { room: ZONE_4, aisle: 1, bay: 1, level: 1, position: 1, n: 12 },
  { room: ZONE_4, aisle: 2, bay: 1, level: 1, position: 1, n: 4 },
  { room: ZONE_4, aisle: 2, bay: 1, level: 2, position: 1, n: 2 },
  { room: ZONE_4, aisle: 2, bay: 3, level: 1, position: 2, n: 1 },
  { room: ZONE_3, aisle: 2, bay: 7, level: 1, position: 1, n: 5 },
  { room: ZONE_3, aisle: null, bay: null, level: null, position: null, n: 1 },
];

async function facets(query: Record<string, string>) {
  const result = await inventoryStockFacets(ORG, new URLSearchParams(query), async () => ADDRESSES, NO_COUNTS);
  return { total: result.total, options: (id: string) => result.groups.find((group) => group.id === id)?.options };
}

test('with no room picked, no address step offers options — an aisle number alone is no place', async () => {
  const { total, options } = await facets({ aisle: '2', bay: '1' });
  assert.equal(total, 25);
  assert.deepEqual(options('room'), [
    { value: ZONE_3, label: ZONE_3, count: 6 },
    { value: locationStockRoomId({ room: ZONE_4 }), label: ZONE_4, count: 19 },
  ]);
  for (const step of ['aisle', 'bay', 'level', 'position']) assert.deepEqual(options(step), [], step);
});

test('each step lists only the values under its picked parents, and the room keeps its whole count', async () => {
  const room = locationStockRoomId({ room: ZONE_4 });
  const { total, options } = await facets({ room, aisle: '2', bay: '1' });
  assert.equal(total, 6);
  // Zone 3's Aisle 2 (bay 7) never leaks into Zone 4's walk.
  assert.deepEqual(options('aisle'), [
    { value: '1', label: 'Aisle 1', count: 12 },
    { value: '2', label: 'Aisle 2', count: 7 },
  ]);
  assert.deepEqual(options('bay'), [
    { value: '1', label: 'Bay 1', count: 6 },
    { value: '3', label: 'Bay 3', count: 1 },
  ]);
  assert.deepEqual(options('level'), [
    { value: '1', label: 'Level 1', count: 4 },
    { value: '2', label: 'Level 2', count: 2 },
  ]);
  assert.deepEqual(options('position'), []);
  assert.equal(options('room')?.find((option) => option.value === room)?.count, 19);
});

test('stock health counts come from the list scope counts on the chip ids', async () => {
  const seen: Array<Parameters<StockScopeCountReader>[0]> = [];
  const result = await inventoryStockFacets(
    ORG,
    new URLSearchParams({ room: ZONE_3, aisle: '2', bay: '7', q: 'brake', status: 'low-stock' }),
    async () => [],
    async (args) => {
      seen.push(args);
      return { inStockPairs: 9, inStockProducts: 4, inStockUnits: 30, onHoldPairs: 1, lowStockPairs: 3, outPairs: 2 };
    },
  );

  assert.deepEqual(seen, [{
    orgId: ORG,
    room: ZONE_3,
    aisle: '2',
    bay: '7',
    level: null,
    position: null,
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
