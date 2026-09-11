import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  readShippedAllDates,
  shippedEffectiveDateWindow,
  shippedWeekFilterActive,
} from './shipped-filter-params';

describe('shippedEffectiveDateWindow', () => {
  it('seeds the current week when nothing else is set', () => {
    assert.deepEqual(
      shippedEffectiveDateWindow({
        allDates: false,
        dateFrom: '',
        dateTo: '',
        anyCarrierFilter: false,
        weekStart: '2026-09-08',
        weekEnd: '2026-09-14',
      }),
      { start: '2026-09-08', end: '2026-09-14' },
    );
    assert.equal(
      shippedWeekFilterActive({ allDates: false, hasDateRange: false, anyCarrierFilter: false }),
      true,
    );
  });

  it('allDates=1 is all-time — the week seed does not re-apply', () => {
    assert.deepEqual(
      shippedEffectiveDateWindow({
        allDates: true,
        dateFrom: '',
        dateTo: '',
        anyCarrierFilter: false,
        weekStart: '2026-09-08',
        weekEnd: '2026-09-14',
      }),
      { start: '', end: '' },
    );
    assert.equal(
      shippedWeekFilterActive({ allDates: true, hasDateRange: false, anyCarrierFilter: false }),
      false,
    );
  });

  it('an explicit range beats the week seed', () => {
    assert.deepEqual(
      shippedEffectiveDateWindow({
        allDates: false,
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
        anyCarrierFilter: false,
        weekStart: '2026-09-08',
        weekEnd: '2026-09-14',
      }),
      { start: '2026-08-01', end: '2026-08-31' },
    );
  });

  it('a carrier/status/exception facet is all-time', () => {
    assert.deepEqual(
      shippedEffectiveDateWindow({
        allDates: false,
        dateFrom: '',
        dateTo: '',
        anyCarrierFilter: true,
        weekStart: '2026-09-08',
        weekEnd: '2026-09-14',
      }),
      { start: '', end: '' },
    );
  });
});

describe('readShippedAllDates', () => {
  it('accepts 1 and true', () => {
    assert.equal(readShippedAllDates(new URLSearchParams('allDates=1')), true);
    assert.equal(readShippedAllDates(new URLSearchParams('allDates=true')), true);
    assert.equal(readShippedAllDates(new URLSearchParams()), false);
  });
});
