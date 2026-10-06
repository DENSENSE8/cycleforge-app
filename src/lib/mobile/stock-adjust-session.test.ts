import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signLocationScanProof } from '@/lib/inventory/location-scan-proof';
import { locationScanProofExpiresAt } from './location-scan-proof-expiry';
import {
  stockAdjustSummary,
  stockAdjustTally,
  undoableStockAdjust,
  type StockAdjustEntry,
} from './stock-adjust-session';

let seq = 0;
const adjust = (code: string, sku: string, delta: number, extra: Partial<StockAdjustEntry> = {}): StockAdjustEntry => ({
  id: `a${++seq}`,
  code,
  face: code,
  sku,
  title: null,
  imageUrl: null,
  delta,
  at: '2026-10-05T12:00:00.000Z',
  proof: 'tok',
  undone: false,
  ...extra,
});

test('the tally counts each location once and units as moved, ignoring undone writes', () => {
  // Newest first, as the store keeps them.
  const entries = [
    adjust('A1', 'X', -1),
    adjust('B2', 'Y', 4, { undone: true }),
    adjust('A1', 'X', 3),
    adjust('C3', 'Z', 2, { proof: null }),
  ];
  assert.deepEqual(stockAdjustTally(entries), { locations: 2, units: 6 });
});

test('a location summary nets each SKU and drops one that came back to zero', () => {
  const entries = [adjust('A1', 'X', -2), adjust('A1', 'Y', 1), adjust('B2', 'Q', 5), adjust('A1', 'X', 2), adjust('A1', 'Y', 2)];
  assert.equal(stockAdjustSummary(entries, 'A1'), 'Y +3');
  assert.equal(stockAdjustSummary(entries, 'B2'), 'Q +5');
  assert.equal(stockAdjustSummary(entries, 'ZZ'), null);
});

test('undo offers the newest scan-backed, not-yet-undone write at that location', () => {
  const newest = adjust('A1', 'X', 1, { proof: null });
  const scanned = adjust('A1', 'Y', -1);
  const older = adjust('A1', 'X', 2);
  assert.equal(undoableStockAdjust([newest, scanned, older], 'A1')?.id, scanned.id);
  assert.equal(undoableStockAdjust([newest, { ...scanned, undone: true }, older], 'A1')?.id, older.id);
  assert.equal(undoableStockAdjust([newest], 'A1'), null);
});

test('the screen reads a real proof expiry; garbage reads as unknown', () => {
  const { token, expiresAt } = signLocationScanProof(
    { organizationId: 'org', staffId: 7, locationCode: 'a0202800' },
    { secret: 'x'.repeat(32), now: 1_000_000, ttlSeconds: 300 },
  );
  assert.equal(locationScanProofExpiresAt(token), Date.parse(expiresAt));
  assert.equal(locationScanProofExpiresAt('not-a-token'), null);
  assert.equal(locationScanProofExpiresAt(null), null);
});
