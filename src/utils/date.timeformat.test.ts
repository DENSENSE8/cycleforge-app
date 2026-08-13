/**
 * Display formatters must follow the live time-format preference and honor an
 * explicit hour12 override. Runs under TZ=UTC (civil/naive inputs are formatted
 * as warehouse wall-clock, no zone shift here since inputs are naive strings).
 *   TZ=UTC tsx --test src/utils/date.timeformat.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDateTimePST,
  formatMonthDayTimePST,
  formatStageClockTimePST,
  formatTime12hPST,
} from './date';
import { setTimeFormat } from '@/lib/time-format/store';

const AFTERNOON = '2026-01-02 16:17:50'; // naive warehouse wall-clock
const MORNING = '2026-01-02 09:05:00';
const JULY = '2026-07-13 16:15:00';

test('default (12h) preserves AM/PM output', () => {
  setTimeFormat('12h');
  assert.equal(formatDateTimePST(AFTERNOON), '01/02/2026 4:17:50 PM');
  assert.equal(formatStageClockTimePST(AFTERNOON), '4:17 PM');
  assert.equal(formatTime12hPST(MORNING), '9:05 AM');
  assert.equal(formatMonthDayTimePST(JULY), 'Jul 13, 4:15 PM');
});

test('24h preference flips every display formatter', () => {
  setTimeFormat('24h');
  assert.equal(formatDateTimePST(AFTERNOON), '01/02/2026 16:17:50');
  assert.equal(formatStageClockTimePST(AFTERNOON), '16:17');
  assert.equal(formatStageClockTimePST(MORNING), '09:05');
  assert.equal(formatTime12hPST(AFTERNOON), '16:17');
  assert.equal(formatMonthDayTimePST(JULY), 'Jul 13, 16:15');
  setTimeFormat('12h'); // reset
});

test('explicit hour12 override beats the preference in both directions', () => {
  setTimeFormat('24h');
  assert.equal(formatDateTimePST(AFTERNOON, { hour12: true }), '01/02/2026 4:17:50 PM');
  assert.equal(formatTime12hPST(AFTERNOON, { hour12: true }), '4:17 PM');
  assert.equal(formatMonthDayTimePST(JULY, { hour12: true }), 'Jul 13, 4:15 PM');
  setTimeFormat('12h');
  assert.equal(formatTime12hPST(AFTERNOON, { hour12: false }), '16:17');
  assert.equal(formatMonthDayTimePST(JULY, { hour12: false }), 'Jul 13, 16:15');
});

test('formatMonthDayTimePST guards empty / sentinel', () => {
  setTimeFormat('12h');
  assert.equal(formatMonthDayTimePST(null), '—');
  assert.equal(formatMonthDayTimePST(''), '—');
  assert.equal(formatMonthDayTimePST('1'), '—');
});
