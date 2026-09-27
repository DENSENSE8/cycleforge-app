import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  readShippedAllDates,
  readShippedDateWindow,
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
        weekStart: '2026-09-08',
        weekEnd: '2026-09-14',
      }),
      { start: '2026-09-08', end: '2026-09-14' },
    );
    assert.equal(
      shippedWeekFilterActive({ allDates: false, hasDateRange: false }),
      true,
    );
  });

  it('allDates=1 is all-time — the week seed does not re-apply', () => {
    assert.deepEqual(
      shippedEffectiveDateWindow({
        allDates: true,
        dateFrom: '',
        dateTo: '',
        weekStart: '2026-09-08',
        weekEnd: '2026-09-14',
      }),
      { start: '', end: '' },
    );
    assert.equal(
      shippedWeekFilterActive({ allDates: true, hasDateRange: false }),
      false,
    );
  });

  it('an explicit range beats the week seed', () => {
    assert.deepEqual(
      shippedEffectiveDateWindow({
        allDates: false,
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
        weekStart: '2026-09-08',
        weekEnd: '2026-09-14',
      }),
      { start: '2026-08-01', end: '2026-08-31' },
    );
  });

  it('carrier / status / exceptions narrow within the window, never widen it to all-time', () => {
    assert.deepEqual(
      readShippedDateWindow(
        new URLSearchParams('dateFrom=2026-08-01&dateTo=2026-08-31&carrier=UPS&statusCategory=IN_TRANSIT&exceptions=1'),
      ),
      { start: '2026-08-01', end: '2026-08-31' },
    );
    assert.deepEqual(readShippedDateWindow(new URLSearchParams('allDates=1&carrier=UPS')), { start: '', end: '' });
  });
});

describe('readShippedAllDates', () => {
  it('accepts 1 and true', () => {
    assert.equal(readShippedAllDates(new URLSearchParams('allDates=1')), true);
    assert.equal(readShippedAllDates(new URLSearchParams('allDates=true')), true);
    assert.equal(readShippedAllDates(new URLSearchParams()), false);
  });
});
