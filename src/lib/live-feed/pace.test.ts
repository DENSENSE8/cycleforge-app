import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDurationMinutes, pacePerHour, pickupTone, warehouseClockHours, yesterdayByNow } from './pace';

const hours = (filled: Record<number, number>) => Array.from({ length: 24 }, (_, h) => filled[h] ?? 0);

test('pacePerHour runs from the first scan-out hour, never over less than half an hour', () => {
  assert.equal(pacePerHour(hours({}), 12), null);
  assert.equal(pacePerHour(hours({ 9: 4, 10: 5 }), 12), 3); // 9 over 3h
  assert.equal(pacePerHour(hours({ 9: 2 }), 9.1), 4); // 2 over the 0.5h floor
});

test('yesterdayByNow pro-rates the current hour', () => {
  assert.equal(yesterdayByNow(hours({ 9: 10, 10: 20 }), 10.5), 20);
  assert.equal(yesterdayByNow(hours({ 9: 10, 10: 20 }), 8), 0);
});

test('pickupTone: amber inside an hour, rose inside 30 minutes or missed with packages left', () => {
  assert.equal(pickupTone(2 * 60 * 60_000, 3), 'calm');
  assert.equal(pickupTone(45 * 60_000, 3), 'soon');
  assert.equal(pickupTone(10 * 60_000, 0), 'urgent');
  assert.equal(pickupTone(-60_000, 2), 'urgent');
  assert.equal(pickupTone(-60_000, 0), 'calm');
});

test('warehouseClockHours reads the warehouse wall clock across DST', () => {
  // 2026-10-05 18:30 UTC = 11:30 PDT; 2026-12-05 18:30 UTC = 10:30 PST.
  assert.equal(warehouseClockHours(Date.parse('2026-10-05T18:30:00.000Z')), 11.5);
  assert.equal(warehouseClockHours(Date.parse('2026-12-05T18:30:00.000Z')), 10.5);
});

test('formatDurationMinutes rounds to whole minutes and never reads zero', () => {
  assert.equal(formatDurationMinutes(0.2), '1m');
  assert.equal(formatDurationMinutes(45), '45m');
  assert.equal(formatDurationMinutes(120), '2h');
  assert.equal(formatDurationMinutes(130.4), '2h 10m');
});
