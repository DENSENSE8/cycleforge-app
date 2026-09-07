/**
 * Operator pulse ranking — the judgment behind the home surface's first row.
 *
 * Run: node --import tsx --test src/lib/assistant/operator-pulse.test.ts
 *
 * These assert the RANKING CONTRACT, which is the whole reason the module
 * exists: a customer waiting outranks stuck inventory, stuck inventory
 * outranks idle inventory, and inside a lane an old small pile outranks a
 * fresh big one. Get that order wrong and the first row is decoration.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoardTilePayload } from '@/components/session/board/board-tiles';
import { operatorPulse, pulseAge, pulsePillarTotals } from './operator-pulse';

const NOW = Date.UTC(2026, 8, 6, 20, 0, 0);
const DAY = 86_400_000;

function gapsTile(gaps: unknown[]): BoardTilePayload {
  return { id: 'roi_gaps', title: 'Close the gaps', tool: 'get_roi_gaps', state: 'ok', data: { gaps } };
}

function supportTile(items: unknown[]): BoardTilePayload {
  return {
    id: 'support_followups',
    title: 'Support follow-ups',
    tool: 'list_support_followups',
    state: 'ok',
    data: { items, count: items.length },
  };
}

const gap = (over: Record<string, unknown>) => ({
  id: 'units_on_hold',
  units: 4,
  unit: 'units',
  oldestDays: 2,
  label: 'Units on hold',
  question: 'q',
  ...over,
});

test('a customer waiting outranks any amount of stuck or idle inventory', () => {
  const pulse = operatorPulse(
    [
      gapsTile([
        gap({ id: 'dead_stock', units: 400, unit: 'skus', oldestDays: 180, question: 'dead' }),
        gap({ id: 'repairs_in_flight', units: 90, oldestDays: 30, question: 'repairs' }),
      ]),
      supportTile([{ ticketId: 1, updatedAtMs: NOW - DAY }]),
    ],
    { now: NOW },
  );
  assert.equal(pulse[0].id, 'support:followups');
  assert.equal(pulse[0].lane, 'promised');
  assert.equal(pulse[0].headline, 'ticket waiting on your reply');
  assert.equal(pulse[0].short, 'awaiting reply');
  // …and idle money still sorts last, behind stuck money.
  assert.deepEqual(
    pulse.map((p) => p.lane),
    ['promised', 'blocked', 'latent'],
  );
});

test('order exceptions ride the promised lane — a buyer is on the other end', () => {
  const pulse = operatorPulse(
    [gapsTile([gap({ id: 'unlisted_units', units: 500, oldestDays: 60 }), gap({ id: 'open_order_exceptions', units: 3, unit: 'orders', oldestDays: 1, question: 'exc' })])],
    { now: NOW },
  );
  assert.equal(pulse[0].id, 'gap:open_order_exceptions');
  assert.equal(pulse[0].count, 3);
  assert.equal(pulse[0].headline, 'orders stuck in exceptions');
  assert.equal(pulse[0].short, 'order exceptions');
});

test('one of a thing reads as one: the lead sentence is authored, not concatenated', () => {
  const pulse = operatorPulse(
    [gapsTile([gap({ id: 'open_order_exceptions', units: 1, unit: 'orders', oldestDays: 4, question: 'q' })])],
    { now: NOW },
  );
  assert.equal(pulse[0].headline, 'order stuck in exceptions');
  assert.equal(pulse[0].count, 1);
});

test('inside a lane, age beats size: a rotting pile is a stopped process', () => {
  const pulse = operatorPulse(
    [
      gapsTile([
        gap({ id: 'repairs_in_flight', units: 120, oldestDays: 2, question: 'fresh' }),
        gap({ id: 'units_on_hold', units: 3, oldestDays: 21, question: 'rotting' }),
      ]),
    ],
    { now: NOW },
  );
  assert.deepEqual(
    pulse.map((p) => p.id),
    ['gap:units_on_hold', 'gap:repairs_in_flight'],
  );
});

test('an unknown age never outranks a measured one in the same lane', () => {
  const pulse = operatorPulse(
    [
      gapsTile([
        gap({ id: 'units_on_hold', units: 900, oldestDays: null, question: 'undated' }),
        gap({ id: 'repairs_in_flight', units: 1, oldestDays: 1, question: 'dated' }),
      ]),
    ],
    { now: NOW },
  );
  assert.equal(pulse[0].id, 'gap:repairs_in_flight');
  assert.equal(pulse[1].ageDays, null);
});

test('empty gaps, denied tiles and broken tools contribute nothing — never an error row', () => {
  const pulse = operatorPulse(
    [
      gapsTile([gap({ units: 0 })]),
      { id: 'roi_gaps', title: 't', tool: 'get_roi_gaps', state: 'denied', error: 'forbidden' },
      { id: 'support_followups', title: 't', tool: 'list_support_followups', state: 'error', error: 'boom' },
      supportTile([]),
    ],
    { now: NOW },
  );
  assert.deepEqual(pulse, []);
});

test('a gap with no question is dropped: the row is a verb, not a statistic', () => {
  const pulse = operatorPulse([gapsTile([gap({ question: '' })])], { now: NOW });
  assert.deepEqual(pulse, []);
});

test('an unrecognized gap id still ranks, in the middle lane, with its own label', () => {
  const pulse = operatorPulse(
    [gapsTile([gap({ id: 'channel_suspensions', label: 'Channel suspensions', units: 2, question: 'q' })])],
    { now: NOW },
  );
  assert.equal(pulse[0].lane, 'blocked');
  assert.equal(pulse[0].headline, 'channel suspensions');
  assert.equal(pulse[0].short, 'channel suspensions');
});

test('order is stable across polls when lane, age and size all tie', () => {
  const tiles = [
    gapsTile([
      gap({ id: 'units_on_hold', units: 5, oldestDays: 3, question: 'a' }),
      gap({ id: 'repairs_in_flight', units: 5, oldestDays: 3, question: 'b' }),
    ]),
  ];
  const first = operatorPulse(tiles, { now: NOW }).map((p) => p.id);
  const second = operatorPulse(tiles, { now: NOW }).map((p) => p.id);
  assert.deepEqual(first, second);
  assert.deepEqual(first, ['gap:repairs_in_flight', 'gap:units_on_hold']);
});

test('ticket age is measured from the OLDEST assignment touch, not the newest', () => {
  const pulse = operatorPulse(
    [supportTile([{ ticketId: 1, updatedAtMs: NOW - DAY }, { ticketId: 2, updatedAtMs: NOW - 9 * DAY }])],
    { now: NOW },
  );
  assert.equal(pulse[0].ageDays, 9);
  assert.equal(pulseAge(pulse[0]), '9 days old');
  assert.equal(pulse[0].headline, 'tickets waiting on your reply');
});

test('age reads without arithmetic, and same-day work says so', () => {
  assert.equal(pulseAge({ ageDays: 1 } as never), '1 day old');
  assert.equal(pulseAge({ ageDays: null } as never), null);
  assert.equal(pulseAge({ ageDays: 0 } as never), 'today');
});

test('the ledger is the FULL ranked set — ranking never caps what the operator sees', () => {
  const gaps = [
    gap({ id: 'open_order_exceptions', units: 3, oldestDays: 4, question: 'exc' }),
    gap({ id: 'repairs_in_flight', units: 9, oldestDays: 6 }),
    gap({ id: 'units_on_hold', units: 2, oldestDays: 1 }),
    gap({ id: 'unlisted_units', units: 47, oldestDays: 12 }),
    gap({ id: 'dead_stock', units: 300, oldestDays: 180 }),
    gap({ id: 'open_receiving_exceptions', units: 5, oldestDays: 3 }),
  ];
  const pulse = operatorPulse([gapsTile(gaps), supportTile([{ ticketId: 1, updatedAtMs: NOW - DAY }])], { now: NOW });
  // Every gap with something in it ranks — nothing is demoted to a counter.
  assert.equal(pulse.length, 7);
  // Lane-first order means the flat list IS the grouping: all promised, then
  assert.deepEqual(
    pulse.map((p) => p.lane),
    ['promised', 'promised', 'blocked', 'blocked', 'blocked', 'latent', 'latent'],
  );
});

test('pillar totals are the telemetry strip: summed from the same ranked items, worst first', () => {
  const pulse = operatorPulse(
    [
      gapsTile([
        gap({ id: 'open_order_exceptions', units: 3, oldestDays: 4, question: 'exc' }),
        gap({ id: 'repairs_in_flight', units: 9, oldestDays: 6, question: 'repairs' }),
        gap({ id: 'unlisted_units', units: 47, oldestDays: 12, question: 'list' }),
      ]),
      supportTile([{ ticketId: 1, updatedAtMs: NOW - DAY }]),
    ],
    { now: NOW },
  );
  const totals = pulsePillarTotals(pulse);
  assert.deepEqual(
    totals.map((t) => `${t.pillar}:${t.count}`),
    ['support:1', 'orders:3', 'refurb:9', 'fulfillment:47'],
  );
  // A strip cell seeds its pillar's WORST item — the same question its
  // ledger row would, never a different query.
  assert.equal(totals.find((t) => t.pillar === 'fulfillment')?.worst?.question, 'list');
  assert.equal(totals.find((t) => t.pillar === 'support')?.worst?.lane, 'promised');
});
