/**
 *   node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     --test src/app/kiosk/v2/kiosk-history-day.test.ts
 *
 * DB-free. The band is pure string surgery over an already-PST-normalized
 * stamp, and every case below is a boundary a bug would cross silently: the
 * today/yesterday edge across a month end, the refusal to re-parse a timestamp
 * into a zone, and the "consecutive, never bucketed" rule that keeps the rail
 * in keyset order.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  KIOSK_HISTORY_UNDATED_LABEL,
  kioskHistoryDayBands,
  kioskHistoryDayKey,
  kioskHistoryDayAge,
  kioskHistoryDayLabel,
} from './kiosk-history-day';

describe('the day a row belongs to', () => {
  it('is the stamp\u2019s own first ten characters, never a re-parsed instant', () => {
    // 11:58 PM on the 17th stays on the 17th. Constructing a `Date` from this
    // string on a UTC tablet would file it under the 18th.
    assert.equal(kioskHistoryDayKey('2026-09-17 23:58:00'), '2026-09-17');
    assert.equal(kioskHistoryDayKey('2026-09-17T23:58:00'), '2026-09-17');
  });

  it('is empty for anything that is not a civil date', () => {
    assert.equal(kioskHistoryDayKey(null), '');
    assert.equal(kioskHistoryDayKey(''), '');
    assert.equal(kioskHistoryDayKey('17/09/2026'), '');
  });
});

describe('what the band prints', () => {
  const today = '2026-03-01';

  it('names the two days the counter reads by name', () => {
    assert.equal(kioskHistoryDayLabel('2026-03-01', today), 'Today');
    // Yesterday is the 28th of February — the month boundary is the case a
    // hand-rolled `key - 1` gets wrong.
    assert.equal(kioskHistoryDayLabel('2026-02-28', today), 'Yesterday');
  });

  it('gives an older day its weekday, and the year only when it is not this one', () => {
    assert.equal(kioskHistoryDayLabel('2026-02-25', today), 'Wednesday, Feb 25');
    assert.equal(kioskHistoryDayLabel('2025-12-24', today), 'Wednesday, Dec 24, 2025');
  });

  it('gives an undated row a band to live under', () => {
    assert.equal(kioskHistoryDayLabel('', today), KIOSK_HISTORY_UNDATED_LABEL);
  });
});

describe('how long ago the band was', () => {
  const today = '2026-09-23';

  it('stays silent where the label already says it, or where there is no age', () => {
    assert.equal(kioskHistoryDayAge('2026-09-23', today), '');
    assert.equal(kioskHistoryDayAge('2026-09-22', today), '');
    assert.equal(kioskHistoryDayAge('', today), '');
    // A tablet clock behind the server's is not a negative age.
    assert.equal(kioskHistoryDayAge('2026-09-24', today), '');
  });

  it('counts civil days, then coarsens at each unit boundary', () => {
    assert.equal(kioskHistoryDayAge('2026-09-21', today), '2 days ago');
    assert.equal(kioskHistoryDayAge('2026-09-10', today), '13 days ago');
    assert.equal(kioskHistoryDayAge('2026-09-09', today), '2 weeks ago');
    // 75 days: the Jul 10 drop-off still on the bench.
    assert.equal(kioskHistoryDayAge('2026-07-10', today), '2 months ago');
    assert.equal(kioskHistoryDayAge('2025-09-23', today), '1 year ago');
  });
});

describe('cutting the rail into bands', () => {
  const row = (key: string, createdAt: string | null) => ({ key, createdAt });
  const at = (r: { createdAt: string | null }) => r.createdAt;

  it('keeps the keyset order and never merges a day that recurs later in the stream', () => {
    const bands = kioskHistoryDayBands(
      [
        row('a', '2026-03-01 14:00:00'),
        row('b', '2026-03-01 09:00:00'),
        row('c', '2026-02-28 16:00:00'),
        // A same-day row AFTER an older one: the list is not sorted the way it
        // claims, and printing a second `Today` band is the honest rendering.
        row('d', '2026-03-01 08:00:00'),
      ],
      at,
      '2026-03-01',
    );

    assert.deepEqual(
      bands.map((b) => [b.label, b.rows.map((r) => r.key)]),
      [
        ['Today', ['a', 'b']],
        ['Yesterday', ['c']],
        ['Today', ['d']],
      ],
    );
  });

  it('bands an undated row instead of dropping it', () => {
    const bands = kioskHistoryDayBands([row('a', null)], at, '2026-03-01');
    assert.deepEqual(bands.map((b) => b.label), [KIOSK_HISTORY_UNDATED_LABEL]);
    assert.equal(bands[0]?.rows.length, 1);
  });
});
