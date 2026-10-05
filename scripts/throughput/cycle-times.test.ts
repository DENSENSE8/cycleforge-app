import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMinutes,
  formatReport,
  measuredStep,
  pairEvents,
  percentile,
  unmeasurableStep,
  type StepEvent,
} from './cycle-times';

const T0 = Date.parse('2026-10-01T00:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000);
const ev = (key: string, role: 'start' | 'end', min: number): StepEvent => ({ key, role, at: at(min) });
const WINDOW = { from: at(0), to: at(1000) };
const META = { id: 'pick_to_pack', from: 'PICK_SCANNED', to: 'PACK_COMPLETED' };

describe('pairEvents', () => {
  it('pairs the earliest start with the earliest end at or after it', () => {
    const pairs = pairEvents([ev('a', 'start', 10), ev('a', 'start', 5), ev('a', 'end', 50), ev('a', 'end', 30)], WINDOW);
    assert.deepEqual(pairs.map((p) => [p.key, p.minutes]), [['a', 25]]);
  });

  it('skips ends that precede the first start and uses the next end', () => {
    const pairs = pairEvents([ev('a', 'end', 1), ev('a', 'start', 10), ev('a', 'end', 40)], WINDOW);
    assert.deepEqual(pairs.map((p) => p.minutes), [30]);
  });

  it('leaves a key unpaired when it has no start or every end precedes the start', () => {
    assert.deepEqual(pairEvents([ev('a', 'end', 20)], WINDOW), []);
    assert.deepEqual(pairEvents([ev('b', 'end', 5), ev('b', 'start', 10)], WINDOW), []);
  });

  it('counts a zero-minute pair (end at the start instant)', () => {
    assert.deepEqual(pairEvents([ev('a', 'start', 10), ev('a', 'end', 10)], WINDOW).map((p) => p.minutes), [0]);
  });

  it('keeps only pairs whose end lands in [from, to); the start may precede the window', () => {
    const window = { from: at(100), to: at(200) };
    const pairs = pairEvents(
      [
        ev('early-start', 'start', 0), ev('early-start', 'end', 150),
        ev('ends-before', 'start', 10), ev('ends-before', 'end', 99),
        ev('ends-at-to', 'start', 110), ev('ends-at-to', 'end', 200),
        ev('ends-at-from', 'start', 50), ev('ends-at-from', 'end', 100),
      ],
      window,
    );
    assert.deepEqual(pairs.map((p) => p.key), ['ends-at-from', 'early-start']);
  });

  it('does not let a later re-scan in the window stand in for a first end before it', () => {
    const window = { from: at(100), to: at(200) };
    assert.deepEqual(pairEvents([ev('a', 'start', 0), ev('a', 'end', 50), ev('a', 'end', 150)], window), []);
  });
});

describe('percentile', () => {
  it('interpolates like Postgres percentile_cont', () => {
    const xs = [1, 2, 3, 4];
    assert.equal(percentile(xs, 0.5), 2.5);
    assert.equal(percentile(xs, 0.9), 3.7);
    assert.equal(percentile(xs, 0), 1);
    assert.equal(percentile(xs, 1), 4);
    assert.equal(percentile([7], 0.9), 7);
  });

  it('refuses an empty sample or p outside [0, 1]', () => {
    assert.throws(() => percentile([], 0.5));
    assert.throws(() => percentile([1], 1.5));
  });
});

describe('step results', () => {
  it('summarizes n, median and p90 rounded to 0.1 minute', () => {
    const pairs = pairEvents([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((m, i) => [ev(`k${i}`, 'start', 0), ev(`k${i}`, 'end', m)]), WINDOW);
    assert.deepEqual(measuredStep(META, pairs), { ...META, n: 10, medianMin: 5.5, p90Min: 9.1 });
  });

  it('reports zero pairs as noData, never a zero median', () => {
    const r = measuredStep(META, []);
    assert.equal(r.n, 0);
    assert.equal(r.medianMin, null);
    assert.equal(r.p90Min, null);
    assert.match(r.noData ?? '', /no PICK_SCANNED → PACK_COMPLETED pair/);
  });

  it('carries the reason for an unmeasurable step', () => {
    assert.deepEqual(unmeasurableStep(META, 'no event'), { ...META, n: 0, medianMin: null, p90Min: null, noData: 'no event' });
  });
});

describe('formatting', () => {
  it('formats spans in minutes, hours, days', () => {
    assert.equal(formatMinutes(null), '—');
    assert.equal(formatMinutes(42.04), '42m');
    assert.equal(formatMinutes(318), '5.3h');
    assert.equal(formatMinutes(3024), '2.1d');
  });

  it('renders the step and daily tables', () => {
    const out = formatReport(
      [measuredStep(META, pairEvents([ev('a', 'start', 0), ev('a', 'end', 30)], WINDOW)), unmeasurableStep({ ...META, id: 'x' }, 'why')],
      [{ day: '2026-10-01', cartonsUnboxed: 2, unitsUnboxed: 5, unitsTested: 1, shipmentsPacked: 3, shipmentsShipped: 0 }],
    );
    assert.match(out, /^step\s+n\s+median\s+p90\s+note$/m);
    assert.match(out, /^pick_to_pack\s+1\s+30m\s+30m$/m);
    assert.match(out, /^x\s+0\s+—\s+—\s+no_data: why$/m);
    assert.match(out, /^2026-10-01\s+2\s+5\s+1\s+3\s+0$/m);
  });
});
