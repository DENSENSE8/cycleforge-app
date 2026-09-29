import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { planSkuPickOwners, type PickHistoryRow } from './pick-history-owners';

const SANG = 3;
const THUC = 2;
const MICHAEL = 1;

/** All-time rows with every pick inside the recent window. */
const recent = (sku: string, staffId: number, picks: number, lastAt = 0): PickHistoryRow => ({
  sku,
  staffId,
  picks,
  recentPicks: picks,
  lastAt,
});

describe('planSkuPickOwners', () => {
  it('2 picks of your own is too thin to name an owner, even at 100%', () => {
    assert.deepEqual(planSkuPickOwners([recent('A', SANG, 2)]), []);
  });

  it('3 of 5 (exactly 60%) names the leader, runner-up as backup', () => {
    assert.deepEqual(planSkuPickOwners([recent('A', SANG, 3), recent('A', THUC, 2)]), [
      { sku: 'A', staffId: SANG, source: 'history', window: 'recent', picks: 3, total: 5, backupStaffId: THUC },
    ]);
  });

  it('59% is not a clear owner', () => {
    assert.deepEqual(planSkuPickOwners([recent('A', SANG, 59), recent('A', THUC, 41)]), []);
  });

  it('a tie for the lead names nobody', () => {
    assert.deepEqual(planSkuPickOwners([recent('A', SANG, 4), recent('A', THUC, 4)]), []);
  });

  it('blank and "No data" item numbers never get an owner', () => {
    assert.deepEqual(
      planSkuPickOwners([recent('', SANG, 9), recent('   ', SANG, 9), recent('No data', THUC, 9), recent(' no DATA ', THUC, 9)]),
      [],
    );
  });

  it('the recent window decides over a stronger all-time record', () => {
    const got = planSkuPickOwners([
      { sku: 'A', staffId: SANG, picks: 50, recentPicks: 0, lastAt: 1 },
      { sku: 'A', staffId: THUC, picks: 4, recentPicks: 4, lastAt: 2 },
    ]);
    assert.deepEqual(got, [
      { sku: 'A', staffId: THUC, source: 'history', window: 'recent', picks: 4, total: 4, backupStaffId: null },
    ]);
  });

  it('a recent leader with under 3 picks falls back to the all-time leader (00001-BK)', () => {
    // Michael leads the last 60 days 2/3; Sang owns all-time 15/19.
    const got = planSkuPickOwners([
      { sku: '00001-BK', staffId: MICHAEL, picks: 2, recentPicks: 2, lastAt: 9 },
      { sku: '00001-BK', staffId: SANG, picks: 15, recentPicks: 1, lastAt: 5 },
      { sku: '00001-BK', staffId: THUC, picks: 2, recentPicks: 0, lastAt: 1 },
    ]);
    assert.deepEqual(got, [
      { sku: '00001-BK', staffId: SANG, source: 'history', window: 'all', picks: 15, total: 19, backupStaffId: MICHAEL },
    ]);
  });

  it('a contested recent window falls back to all-time; contested there too names nobody', () => {
    const tiedRecent = [
      { sku: 'A', staffId: SANG, picks: 9, recentPicks: 3, lastAt: 1 },
      { sku: 'A', staffId: THUC, picks: 3, recentPicks: 3, lastAt: 2 },
    ];
    assert.equal(planSkuPickOwners(tiedRecent)[0]?.staffId, SANG);
    assert.deepEqual(
      planSkuPickOwners([
        { sku: 'A', staffId: SANG, picks: 5, recentPicks: 3, lastAt: 1 },
        { sku: 'A', staffId: THUC, picks: 5, recentPicks: 3, lastAt: 2 },
      ]),
      [],
    );
  });

  it('with no recent picks, all-time decides', () => {
    const got = planSkuPickOwners([
      { sku: 'A', staffId: SANG, picks: 6, recentPicks: 0, lastAt: 1 },
      { sku: 'A', staffId: THUC, picks: 2, recentPicks: 0, lastAt: 2 },
    ]);
    assert.deepEqual(got, [
      { sku: 'A', staffId: SANG, source: 'history', window: 'all', picks: 6, total: 8, backupStaffId: THUC },
    ]);
  });

  it('runner-up ties break to the most recent picker', () => {
    const got = planSkuPickOwners([recent('A', SANG, 8, 1), recent('A', THUC, 1, 5), recent('A', MICHAEL, 1, 9)]);
    assert.equal(got[0].backupStaffId, MICHAEL);
  });

  it('an override wins over history, and names an owner for an item nobody picked', () => {
    const got = planSkuPickOwners(
      [recent('A', SANG, 57), recent('A', MICHAEL, 3)],
      new Map([
        ['A', MICHAEL],
        ['B', MICHAEL],
      ]),
    );
    assert.deepEqual(got, [
      { sku: 'A', staffId: MICHAEL, source: 'override', window: 'recent', picks: 3, total: 60, backupStaffId: SANG },
      { sku: 'B', staffId: MICHAEL, source: 'override', window: 'all', picks: 0, total: 0, backupStaffId: null },
    ]);
  });
});
