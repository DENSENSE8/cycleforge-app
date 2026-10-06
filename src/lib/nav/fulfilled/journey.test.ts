import test from 'node:test';
import assert from 'node:assert/strict';
import { FULFILLED_BUCKET_IDS } from '@/lib/nav/locate/bucket-precedence';
import { addWarehouseBusinessDays } from '@/lib/shipping/carrier-pickup-window';
import { ORDER_CHECK_IN_STATES } from '@/lib/support/conversation/model';
import { checkInStage, journeyClock, journeyStage, type JourneyClockFacts } from './journey';
import type { FulfilledCheckInRow } from './sql';

const HAND_OFF = '2026-10-01T18:00:00.000Z';
const EVENT = '2026-10-03T12:00:00.000Z';
const POLL = '2026-10-04T09:00:00.000Z';
const EXCEPTION = '2026-10-03T08:00:00.000Z';
const PROMISE = '2026-10-04T00:00:00.000Z';
const DELIVERED = '2026-10-04T20:00:00.000Z';
const TRIGGER = '2026-10-04T20:00:00.000Z';
const DUE = '2026-10-06T20:00:00.000Z';
const CONTACTED = '2026-10-06T21:00:00.000Z';
const NEXT = '2026-10-09T21:00:00.000Z';
const REPLIED = '2026-10-07T15:00:00.000Z';
const CLOSED = '2026-10-08T16:00:00.000Z';

function checkIn(state: FulfilledCheckInRow['state'], patch: Partial<FulfilledCheckInRow> = {}): FulfilledCheckInRow {
  return {
    state,
    supportItemId: 9,
    triggerAt: TRIGGER,
    dueAt: DUE,
    contactedAt: CONTACTED,
    nextFollowUpAt: NEXT,
    repliedAt: REPLIED,
    closedAt: CLOSED,
    outcome: null,
    ...patch,
  };
}

const FACTS: JourneyClockFacts = {
  lead: { handOffAt: HAND_OFF, latestEventAt: EVENT, lastCheckedAt: POLL, exceptionAt: EXCEPTION, promisedAt: PROMISE },
  deliveredAt: DELIVERED,
  checkIn: checkIn('not_due'),
};

test('check-in stage: every state and outcome of a delivered order', () => {
  const expected: Record<string, string> = {
    not_applicable: 'delivered',
    not_due: 'check_in_scheduled',
    due: 'check_in_due',
    follow_up_due: 'check_in_due',
    staff_reply_due: 'reply_due',
    contacted: 'checked_in',
    waiting_customer: 'checked_in',
    customer_replied: 'checked_in',
    resolved: 'closed',
    no_response_closed: 'no_reply',
  };
  assert.deepEqual(Object.keys(expected).sort(), [...ORDER_CHECK_IN_STATES].sort());
  for (const state of ORDER_CHECK_IN_STATES) {
    assert.equal(journeyStage('delivered', checkIn(state)), expected[state], state);
  }
  assert.equal(journeyStage('delivered', null), 'delivered');
  assert.equal(checkInStage(checkIn('resolved', { outcome: 'happy' })), 'happy');
  assert.equal(checkInStage(checkIn('resolved', { outcome: 'issue' })), 'issue');
  assert.equal(checkInStage(checkIn('resolved', { outcome: null })), 'closed');
});

test('journey stage: a not-delivered order competes only with a check-in that is owed now, by bucket precedence', () => {
  // Reply due outranks every Watch carrier bucket and Late; Exception / Returned still lead.
  assert.equal(journeyStage('in_transit', checkIn('staff_reply_due')), 'reply_due');
  assert.equal(journeyStage('late', checkIn('staff_reply_due')), 'reply_due');
  assert.equal(journeyStage('exception', checkIn('staff_reply_due')), 'exception');
  // The shipped fallback's check-in: due beats In transit, not No movement.
  assert.equal(journeyStage('in_transit', checkIn('due')), 'check_in_due');
  assert.equal(journeyStage('out_for_delivery', checkIn('follow_up_due')), 'check_in_due');
  assert.equal(journeyStage('no_movement', checkIn('due')), 'no_movement');
  // States that owe nothing leave the carrier bucket alone.
  for (const state of ['not_due', 'contacted', 'waiting_customer', 'customer_replied', 'resolved', 'no_response_closed', 'not_applicable'] as const) {
    assert.equal(journeyStage('in_transit', checkIn(state, { outcome: 'happy' })), 'in_transit', state);
  }
  assert.equal(journeyStage('stalled', null), 'stalled');
});

test('journey clock: since / due per bucket', () => {
  const handOffDue = addWarehouseBusinessDays(new Date(HAND_OFF)).toISOString();
  assert.deepEqual(journeyClock('awaiting', FACTS), { since: HAND_OFF, due: handOffDue });
  assert.deepEqual(journeyClock('no_movement', FACTS), { since: HAND_OFF, due: handOffDue });
  for (const bucket of ['in_transit', 'out_for_delivery', 'stalled'] as const) {
    assert.deepEqual(journeyClock(bucket, FACTS), { since: EVENT, due: '2026-10-06T12:00:00.000Z' }, bucket);
  }
  assert.deepEqual(journeyClock('late', FACTS), { since: HAND_OFF, due: PROMISE });
  assert.deepEqual(journeyClock('tracking_stale', FACTS), { since: POLL, due: '2026-10-05T09:00:00.000Z' });
  assert.deepEqual(journeyClock('tracking_stale', { ...FACTS, lead: { ...FACTS.lead!, lastCheckedAt: null } }), {
    since: HAND_OFF,
    due: '2026-10-02T18:00:00.000Z',
  });
  assert.deepEqual(journeyClock('exception', FACTS), { since: EXCEPTION, due: null });
  assert.deepEqual(journeyClock('exception', { ...FACTS, lead: { ...FACTS.lead!, exceptionAt: null } }), { since: EVENT, due: null });
  assert.deepEqual(journeyClock('returned', FACTS), { since: EVENT, due: null });
  assert.deepEqual(journeyClock('no_tracking', FACTS), { since: HAND_OFF, due: null });
  assert.deepEqual(journeyClock('untracked', FACTS), { since: HAND_OFF, due: null });
  assert.deepEqual(journeyClock('check_in_scheduled', FACTS), { since: TRIGGER, due: DUE });
  assert.deepEqual(journeyClock('check_in_due', { ...FACTS, checkIn: checkIn('due') }), { since: TRIGGER, due: DUE });
  assert.deepEqual(journeyClock('check_in_due', { ...FACTS, checkIn: checkIn('follow_up_due') }), { since: CONTACTED, due: NEXT });
  assert.deepEqual(journeyClock('checked_in', { ...FACTS, checkIn: checkIn('contacted') }), { since: CONTACTED, due: NEXT });
  assert.deepEqual(journeyClock('reply_due', { ...FACTS, checkIn: checkIn('staff_reply_due') }), {
    since: REPLIED,
    due: '2026-10-08T15:00:00.000Z',
  });
  for (const bucket of ['happy', 'issue', 'closed', 'no_reply'] as const) {
    assert.deepEqual(journeyClock(bucket, FACTS), { since: CLOSED, due: null }, bucket);
  }
  assert.deepEqual(journeyClock('delivered', FACTS), { since: DELIVERED, due: null });
});

test('journey clock: null when nothing says when the bucket started; every bucket answers', () => {
  const empty: JourneyClockFacts = { lead: null, deliveredAt: null, checkIn: null };
  for (const bucket of FULFILLED_BUCKET_IDS) assert.equal(journeyClock(bucket, empty), null, bucket);
  assert.equal(journeyClock('reply_due', { ...FACTS, checkIn: checkIn('staff_reply_due', { repliedAt: null }) }), null);
});
