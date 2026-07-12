/**
 * Civil-date helpers must be host-TZ independent. Run under both:
 *   TZ=UTC node --test --import tsx src/utils/date.civil.test.ts
 *   TZ=America/Los_Angeles node --test --import tsx src/utils/date.civil.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addDaysToDateKey,
  dateKeyFromParts,
  dateKeyToLocalDate,
  diffDaysDateKey,
  formatApiInstant,
  formatDateKeyMedium,
  formatDateKeyShort,
  formatWeekRangeCompact,
  isDateKey,
  localDateToDateKey,
  parseDateKey,
  warehouseDayUtcBounds,
  weekdayOfDateKey,
} from '@/utils/date';

test('parseDateKey accepts only real civil days', () => {
  assert.deepEqual(parseDateKey('2026-06-01'), { y: 2026, m: 6, d: 1 });
  assert.equal(parseDateKey('2026-02-31'), null);
  assert.equal(parseDateKey('2026-13-01'), null);
  assert.equal(parseDateKey('06/01/2026'), null);
  assert.equal(parseDateKey('2026-06-01T00:00:00Z'), null);
  assert.equal(isDateKey('2026-06-01'), true);
  assert.equal(isDateKey('not-a-date'), false);
});

test('addDaysToDateKey / diffDaysDateKey are pure civil math', () => {
  assert.equal(addDaysToDateKey('2026-06-01', 2), '2026-06-03');
  assert.equal(addDaysToDateKey('2026-06-01', -1), '2026-05-31');
  assert.equal(addDaysToDateKey('2026-12-31', 1), '2027-01-01');
  assert.equal(diffDaysDateKey('2026-06-01', '2026-06-03'), 2);
  assert.equal(diffDaysDateKey('2026-06-03', '2026-06-01'), -2);
  assert.equal(diffDaysDateKey('2026-06-01', '2026-06-01'), 0);
});

test('formatDateKeyShort never shifts a day under any host TZ', () => {
  // This was the CI failure class: Jun 1 → May 31 on UTC runners.
  assert.equal(formatDateKeyShort('2026-06-01'), 'Jun 1');
  assert.equal(formatDateKeyShort('2026-06-03'), 'Jun 3');
  assert.equal(formatDateKeyShort('2026-01-01'), 'Jan 1');
  assert.equal(formatDateKeyShort('2026-12-31'), 'Dec 31');
});

test('formatDateKeyMedium is host-TZ stable', () => {
  const label = formatDateKeyMedium('2026-06-01', { weekday: 'short' });
  assert.match(label, /Jun 1/);
  // Monday 2026-06-01
  assert.match(label, /Mon/);
});

test('weekdayOfDateKey is civil (2026-06-01 is Monday)', () => {
  // 0=Sun … 6=Sat
  assert.equal(weekdayOfDateKey('2026-06-01'), 1);
  assert.equal(weekdayOfDateKey('2026-05-31'), 0);
});

test('dateKeyToLocalDate ↔ localDateToDateKey round-trip', () => {
  const d = dateKeyToLocalDate('2026-06-01');
  assert.ok(d);
  assert.equal(localDateToDateKey(d), '2026-06-01');
  assert.equal(dateKeyFromParts(2026, 6, 1), '2026-06-01');
});

test('warehouseDayUtcBounds covers a full LA wall day as UTC instants', () => {
  const b = warehouseDayUtcBounds('2026-06-01');
  assert.ok(b);
  // PDT (UTC-7) in June: midnight LA = 07:00Z
  assert.equal(b.startIso, '2026-06-01T07:00:00.000Z');
  // end is 23:59:59.999 LA → next calendar day 06:59:59.999Z
  assert.equal(b.endIso, '2026-06-02T06:59:59.999Z');
});

test('formatWeekRangeCompact uses civil keys only', () => {
  assert.equal(formatWeekRangeCompact('2026-06-01', '2026-06-05'), 'JUN 1st - 5th');
  assert.match(formatWeekRangeCompact('2026-05-30', '2026-06-02'), /MAY 30th/);
  assert.match(formatWeekRangeCompact('2026-05-30', '2026-06-02'), /JUN 2nd/);
});

test('formatApiInstant is real UTC (not host-offset Z-lie)', () => {
  const d = new Date('2026-06-01T15:30:45.123Z');
  assert.equal(formatApiInstant(d), '2026-06-01T15:30:45.123Z');
});
