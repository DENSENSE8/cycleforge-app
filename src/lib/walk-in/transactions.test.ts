import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countTransactions,
  filterTransactions,
  mergeTransactions,
  pickupToTransaction,
  repairToTransaction,
  saleToTransaction,
  summarizeTransactions,
  type PickupOrderRow,
  type SaleRow,
} from '@/lib/walk-in/transactions';
import type { RSRecord } from '@/lib/neon/repair-service-queries';

// 2026-07-16T19:00:00Z = noon PST on the 16th — safely inside one warehouse day
// under TZ=UTC, so the civil-day assertions don't drift with the runner's zone.
const sale = (over: Partial<SaleRow> = {}): SaleRow => ({
  id: 's1',
  customer_name: 'Jane Cruz',
  total: 24900, // CENTS
  status: 'COMPLETED',
  order_source: 'walk_in_sale',
  created_at: '2026-07-16T19:00:00Z',
  line_items: [{ name: 'Dock', quantity: '2' }],
  ...over,
});

const pickup = (over: Partial<PickupOrderRow> = {}): PickupOrderRow => ({
  id: 7,
  pickup_date: '2026-07-16',
  customer_name: 'Ana Ruiz',
  status: 'COMPLETED',
  item_count: 4,
  total_value: '1299.00', // DOLLARS
  completed_at: '2026-07-16T18:00:00Z',
  created_at: '2026-07-10T18:00:00Z',
  ...over,
});

const repair = (over: Partial<RSRecord> = {}): RSRecord =>
  ({
    id: 3,
    created_at: '2026-07-10T18:00:00Z',
    updated_at: '2026-07-16T17:00:00Z',
    ticket_number: 'RS-3',
    contact_info: '555-0100',
    product_title: 'Dell Latitude 5490',
    price: '80.00', // DOLLARS
    issue: 'No power',
    serial_number: 'SN1',
    status: 'Picked Up',
    customer_name: 'Marco Diaz',
    ...over,
  }) as RSRecord;

// Each spine stores money in a different unit — the adapters are the only place
// that difference is allowed to exist.
test('adapters normalize each spine\'s money unit', () => {
  assert.equal(saleToTransaction(sale()).amount, 249); // cents → dollars
  assert.equal(pickupToTransaction(pickup()).amount, 1299);
  assert.equal(repairToTransaction(repair()).amount, 80);
});

test('a sale with no total renders an em dash, not $0', () => {
  assert.equal(saleToTransaction(sale({ total: null })).amountLabel, '—');
});

test('adapters fall back through the identity chain', () => {
  assert.equal(saleToTransaction(sale({ customer_name: '  ' })).customer, 'Walk-in');
  // No customer_name → contact_info before the generic fallback.
  assert.equal(repairToTransaction(repair({ customer_name: null })).customer, '555-0100');
});

// A done repair's transaction moment is pickup (updated_at), not intake.
test('pickup/repair rows date from completion, not creation', () => {
  assert.equal(pickupToTransaction(pickup()).dateKey, '2026-07-16');
  assert.equal(repairToTransaction(repair()).dateKey, '2026-07-16');
  // A pickup with no completion stamp falls back to created_at.
  assert.equal(pickupToTransaction(pickup({ completed_at: null })).dateKey, '2026-07-10');
});

test('mergeTransactions orders every spine newest-first', () => {
  const rows = mergeTransactions(
    [repairToTransaction(repair())], // 17:00
    [saleToTransaction(sale())], // 19:00
    [pickupToTransaction(pickup())], // 18:00
  );
  assert.deepEqual(rows.map((r) => r.kind), ['sale', 'pickup', 'repair']);
});

test('undated rows sort last instead of poisoning the merge', () => {
  const rows = mergeTransactions(
    [saleToTransaction(sale({ id: 'bad', created_at: 'not-a-date' }))],
    [saleToTransaction(sale())],
  );
  assert.deepEqual(rows.map((r) => r.key), ['sale-s1', 'sale-bad']);
});

test('a category tab narrows the same merged feed; all keeps every kind', () => {
  const rows = mergeTransactions(
    [saleToTransaction(sale())],
    [pickupToTransaction(pickup())],
    [repairToTransaction(repair())],
  );
  assert.equal(filterTransactions(rows, 'all').length, 3);
  assert.deepEqual(filterTransactions(rows, 'sales').map((r) => r.kind), ['sale']);
  assert.deepEqual(filterTransactions(rows, 'pickups').map((r) => r.kind), ['pickup']);
  assert.deepEqual(filterTransactions(rows, 'repairs').map((r) => r.kind), ['repair']);
});

test('countTransactions reports every tab in one pass', () => {
  const rows = mergeTransactions(
    [saleToTransaction(sale()), saleToTransaction(sale({ id: 's2' }))],
    [pickupToTransaction(pickup())],
  );
  assert.deepEqual(countTransactions(rows), { all: 3, sales: 2, pickups: 1, repairs: 0 });
});

// The KPI heroes are derived from the rows the feed renders, so they can never
// disagree with the list under them.
test('summarizeTransactions rolls up the rows it is given', () => {
  const rows = mergeTransactions(
    [saleToTransaction(sale())], // $249, 16th
    [pickupToTransaction(pickup({ completed_at: '2026-07-10T18:00:00Z' }))], // $1299, 10th
  );
  const rollup = summarizeTransactions(rows);
  assert.equal(rollup.count, 2);
  assert.equal(rollup.gross, '$1,548.00');
  assert.equal(rollup.average, '$774.00');
  assert.equal(rollup.latestDayKey, '2026-07-16');
  assert.equal(rollup.latestDayCount, 1);
});

test('an empty feed rolls up to zeroes, not NaN', () => {
  const rollup = summarizeTransactions([]);
  assert.equal(rollup.count, 0);
  assert.equal(rollup.gross, '$0.00');
  assert.equal(rollup.average, '$0.00');
  assert.equal(rollup.latestDayKey, null);
});
