import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clipIntervalMs,
  formatActiveDuration,
  sessionDayNoteLine,
  sessionDayStatus,
} from './session-day-fold';

describe('clipIntervalMs', () => {
  it('counts only the overlap of an active stretch with the day window', () => {
    const dayStart = Date.parse('2026-09-01T07:00:00.000Z');
    const dayEnd = Date.parse('2026-09-02T06:59:59.999Z');
    const now = Date.parse('2026-09-01T18:00:00.000Z');
    const started = Date.parse('2026-09-01T06:00:00.000Z');
    const ended = Date.parse('2026-09-01T09:00:00.000Z');
    assert.equal(clipIntervalMs(started, ended, dayStart, dayEnd, now), 2 * 3_600_000);
  });

  it('open-ended intervals clip at now, not wall-clock to day end', () => {
    const dayStart = Date.parse('2026-09-01T07:00:00.000Z');
    const dayEnd = Date.parse('2026-09-02T06:59:59.999Z');
    const now = Date.parse('2026-09-01T08:00:00.000Z');
    const started = Date.parse('2026-09-01T07:30:00.000Z');
    assert.equal(clipIntervalMs(started, null, dayStart, dayEnd, now), 30 * 60_000);
  });

  it('parked-outside-the-window is zero', () => {
    const dayStart = Date.parse('2026-09-01T07:00:00.000Z');
    const dayEnd = Date.parse('2026-09-02T06:59:59.999Z');
    const now = nowMs();
    assert.equal(
      clipIntervalMs(
        Date.parse('2026-08-31T00:00:00.000Z'),
        Date.parse('2026-08-31T12:00:00.000Z'),
        dayStart,
        dayEnd,
        now,
      ),
      0,
    );
  });
});

describe('formatActiveDuration', () => {
  it('formats hours and minutes, never a live clock', () => {
    assert.equal(formatActiveDuration(0), null);
    assert.equal(formatActiveDuration(30_000), '<1m');
    assert.equal(formatActiveDuration(5 * 60_000), '5m');
    assert.equal(formatActiveDuration(2 * 3_600_000), '2h');
    assert.equal(formatActiveDuration(2 * 3_600_000 + 14 * 60_000), '2h 14m');
  });
});

describe('sessionDayNoteLine', () => {
  it('joins duration and station names, never a live clock', () => {
    assert.equal(sessionDayNoteLine(0, []), null);
    assert.equal(
      sessionDayNoteLine(2 * 3_600_000 + 14 * 60_000, ['Unbox', 'Packing']),
      '2h 14m · Unbox · Packing',
    );
  });
});

describe('sessionDayStatus', () => {
  it('armed wins, then open, then parked, then ended', () => {
    assert.equal(sessionDayStatus({ armed: true, hasOpen: true, hasParked: true }), 'armed');
    assert.equal(sessionDayStatus({ armed: false, hasOpen: true, hasParked: true }), 'open');
    assert.equal(sessionDayStatus({ armed: false, hasOpen: false, hasParked: true }), 'parked');
    assert.equal(sessionDayStatus({ armed: false, hasOpen: false, hasParked: false }), 'ended');
  });
});

function nowMs(): number {
  return Date.parse('2026-09-01T18:00:00.000Z');
}
