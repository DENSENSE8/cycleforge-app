import test from 'node:test';
import assert from 'node:assert/strict';
import type { PackageBoard, PackageColumn } from '@/lib/live-feed/types';
import { toTvLiveFeed, tvLiveFeedTotals } from './tv-live-feed';

function column(partial: Partial<PackageColumn> & Pick<PackageColumn, 'stage' | 'count'>): PackageColumn {
  return { earlierCount: 0, lateCount: 0, stalledCount: 0, previousCount: null, items: [], hasMore: false, ...partial };
}

const hours = (filled: Record<number, number>) => Array.from({ length: 24 }, (_, h) => filled[h] ?? 0);

const BOARD: PackageBoard = {
  generatedAt: '2026-10-05T18:00:00.000Z',
  // Out of pipeline order on purpose: the projection reorders.
  columns: [
    column({ stage: 'scanned_out', count: 9, previousCount: 40 }),
    column({ stage: 'to_pick', count: 37, lateCount: 20 }),
    column({ stage: 'picked', count: 17, lateCount: 11, stalledCount: 17 }),
    column({ stage: 'packed', count: 10, lateCount: 4, stalledCount: 10 }),
  ],
  pace: { today: hours({ 9: 4, 10: 5 }), yesterday: hours({ 9: 10, 10: 20 }) },
  carriers: [{ carrier: 'USPS', toPick: 1, picked: 0, packed: 0, scannedOut: 0 }],
  pickups: [
    { carrier: 'UPS', cutoffAt: '2026-10-05T23:00:00.000Z', cutoffLocal: '16:00', notPacked: 3, packed: 1, scannedOut: 2 },
    { carrier: 'USPS', cutoffAt: '2026-10-05T22:00:00.000Z', cutoffLocal: '15:00', notPacked: 5, packed: 0, scannedOut: 7 },
  ],
  facets: { carrier: [], channel: [] },
};

test('toTvLiveFeed keeps numbers only, in pipeline order, pickups soonest first', () => {
  const feed = toTvLiveFeed(BOARD);
  assert.deepEqual(
    feed.stages.map((s) => [s.stage, s.count, s.lateCount, s.stalledCount]),
    [
      ['to_pick', 37, 20, 0],
      ['picked', 17, 11, 17],
      ['packed', 10, 4, 10],
      ['scanned_out', 9, 0, 0],
    ],
  );
  assert.deepEqual(feed.scannedOut, { today: 9, yesterday: 40 });
  assert.deepEqual(feed.pickups.map((p) => p.carrier), ['USPS', 'UPS']);
  assert.deepEqual(Object.keys(feed.pickups[0]!).sort(), ['carrier', 'cutoffAt', 'cutoffLocal', 'notPacked', 'packed']);
  assert.equal(feed.pace.today.length, 24);
  // No cards (and so no customer names) reach the wall.
  assert.equal(JSON.stringify(feed).includes('items'), false);
});

test('toTvLiveFeed fills a missing stage with zeros', () => {
  const feed = toTvLiveFeed({ ...BOARD, columns: [column({ stage: 'to_pick', count: 2 })] });
  assert.deepEqual(feed.stages.map((s) => s.count), [2, 0, 0, 0]);
  assert.deepEqual(feed.scannedOut, { today: 0, yesterday: 0 });
});

test('tvLiveFeedTotals sums the open stages only', () => {
  assert.deepEqual(tvLiveFeedTotals(toTvLiveFeed(BOARD)), { inBuilding: 64, late: 35, stalled: 27 });
});
