import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readShippedAllDates, readShippedDateWindow, shippedEffectiveDateWindow } from './shipped-filter-params';

const WEEK = { start: '2026-09-08', end: '2026-09-14' };

describe('shippedEffectiveDateWindow', () => {
  it('is all-time when nothing narrows it — every shipped package, not this week', () => {
    assert.deepEqual(shippedEffectiveDateWindow({ allDates: false, dateFrom: '', dateTo: '', week: null }), { start: '', end: '' });
    assert.deepEqual(readShippedDateWindow(new URLSearchParams('carrier=UPS')), { start: '', end: '' });
  });

  it('a named week narrows to that week; allDates=1 still forces all-time', () => {
    assert.deepEqual(shippedEffectiveDateWindow({ allDates: false, dateFrom: '', dateTo: '', week: WEEK }), WEEK);
    assert.deepEqual(shippedEffectiveDateWindow({ allDates: true, dateFrom: '', dateTo: '', week: WEEK }), { start: '', end: '' });
    const named = readShippedDateWindow(new URLSearchParams('shippedWeekOffset=2'));
    assert.ok(named.start && named.end && named.start <= named.end, 'the offset names a week');
  });

  it('an explicit range beats a named week', () => {
    assert.deepEqual(
      shippedEffectiveDateWindow({ allDates: false, dateFrom: '2026-08-01', dateTo: '2026-08-31', week: WEEK }),
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
