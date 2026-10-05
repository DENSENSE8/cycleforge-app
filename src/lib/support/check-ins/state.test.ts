import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORT_CHECK_IN_DELAYS_MS } from './config';
import {
  collectCheckInContacts,
  deriveOrderCheckInState,
  type CheckInDerivationInput,
  type CheckInFollowUpFact,
  type CheckInMessageFact,
} from './state';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-10-10T12:00:00Z');
const CHASE = SUPPORT_CHECK_IN_DELAYS_MS.chase;

const out = (id: number, atMs: number, deliveryState: CheckInMessageFact['deliveryState'] = 'sent'): CheckInMessageFact => ({
  id, direction: 'outbound', deliveryState, replyDisposition: null, atMs,
});
const inb = (id: number, atMs: number, replyDisposition: CheckInMessageFact['replyDisposition'] = 'pending'): CheckInMessageFact => ({
  id, direction: 'inbound', deliveryState: null, replyDisposition, atMs,
});
const fu = (id: number, atMs: number, channel = 'call', threadMessageId: number | null = null): CheckInFollowUpFact => ({
  id, direction: 'outbound', channel, threadMessageId, atMs,
});

function input(over: Partial<CheckInDerivationInput> = {}): CheckInDerivationInput {
  return {
    nowMs: T0,
    dueAtMs: T0 - DAY,
    item: { lifecycle: 'open', resolvedAtMs: null, resolvedByStaffId: null },
    messages: [],
    followUps: [],
    taskNextFollowUpAtMs: null,
    storedClosure: null,
    ...over,
  };
}

test('not_due → due by the due instant only', () => {
  assert.equal(deriveOrderCheckInState(input({ dueAtMs: T0 + 1 })).state, 'not_due');
  assert.equal(deriveOrderCheckInState(input({ dueAtMs: T0 })).state, 'due');
});

test('contact proof: time passing, a copied or failed reply, an internal note, a note follow-up are NOT contact', () => {
  const weekLater = input({
    nowMs: T0 + 30 * DAY,
    messages: [out(1, T0, 'copied'), out(2, T0, 'failed'), out(3, T0, 'pending'), { ...out(4, T0), direction: 'internal', deliveryState: null }],
    followUps: [fu(10, T0, 'note'), fu(11, T0, 'message', 1)],
  });
  const d = deriveOrderCheckInState(weekLater);
  assert.equal(d.state, 'due');
  assert.equal(d.contactedAtMs, null);
  assert.equal(d.contactMessageId, null);
  assert.equal(d.contactFollowUpId, null);
});

test('contacted: first sent/logged outbound message, with its follow-up row merged', () => {
  const d = deriveOrderCheckInState(input({ messages: [out(7, T0 - 3600_000, 'logged')], followUps: [fu(70, T0 - 3600_000, 'message', 7)] }));
  assert.equal(d.state, 'contacted');
  assert.equal(d.contactedAtMs, T0 - 3600_000);
  assert.equal(d.contactMessageId, 7);
  assert.equal(d.contactFollowUpId, 70);
  assert.equal(d.nextFollowUpAtMs, T0 - 3600_000 + CHASE, 'chase scheduled 3 days after contact');
  assert.equal(d.nextFollowUpFromChase, true);
});

test('contacted by a logged call alone (no message)', () => {
  const d = deriveOrderCheckInState(input({ followUps: [fu(5, T0 - 1000, 'call')] }));
  assert.equal(d.state, 'contacted');
  assert.equal(d.contactMessageId, null);
  assert.equal(d.contactFollowUpId, 5);
});

test('waiting_customer while the item waits; follow_up_due once the chase instant passes', () => {
  const contact = [out(1, T0)];
  assert.equal(deriveOrderCheckInState(input({ messages: contact, item: { lifecycle: 'waiting_customer', resolvedAtMs: null, resolvedByStaffId: null } })).state, 'waiting_customer');
  const due = deriveOrderCheckInState(input({ nowMs: T0 + CHASE, messages: contact }));
  assert.equal(due.state, 'follow_up_due');
  assert.equal(due.chaseCount, 0);
});

test('a staff-set task follow-up date wins over the default chase, and is not re-stamped', () => {
  const d = deriveOrderCheckInState(input({ nowMs: T0 + CHASE, messages: [out(1, T0)], taskNextFollowUpAtMs: T0 + 7 * DAY }));
  assert.equal(d.state, 'contacted');
  assert.equal(d.nextFollowUpAtMs, T0 + 7 * DAY);
  assert.equal(d.nextFollowUpFromChase, false);
});

test('chase count: a contact while the customer stayed silent is a chase; a reply in between is not', () => {
  const silent = deriveOrderCheckInState(input({ nowMs: T0 + 10 * DAY, messages: [out(1, T0), out(2, T0 + CHASE)] }));
  assert.equal(silent.chaseCount, 1);
  assert.equal(silent.contactMessageId, 1, 'contact proof stays the FIRST contact');
  assert.equal(silent.state, 'follow_up_due', 'past the second chase instant: staff may now close as no response');

  const talked = deriveOrderCheckInState(input({ messages: [out(1, T0 - 2 * DAY), inb(2, T0 - DAY, 'answered'), out(3, T0 - 1000)] }));
  assert.equal(talked.chaseCount, 0);
  assert.equal(talked.state, 'contacted');
});

test('staff_reply_due: a pending customer message, regardless of contact', () => {
  const d = deriveOrderCheckInState(input({ messages: [out(1, T0 - DAY), inb(2, T0 - 1000)] }));
  assert.equal(d.state, 'staff_reply_due');
  assert.equal(d.latestInboundMessageId, 2);
  assert.equal(d.nextFollowUpAtMs, null, 'no chase while a reply is owed');
  assert.equal(deriveOrderCheckInState(input({ messages: [inb(3, T0 - 1000)] })).state, 'staff_reply_due');
});

test('customer_replied: the customer had the last word and nothing is owed', () => {
  const d = deriveOrderCheckInState(input({ nowMs: T0 + 30 * DAY, messages: [out(1, T0 - DAY), inb(2, T0, 'no_reply_required')] }));
  assert.equal(d.state, 'customer_replied');
  assert.equal(d.nextFollowUpAtMs, null);
});

test('resolved: default disposition resolved, closed at resolution; stored no_response_closed kept', () => {
  const resolvedItem = { lifecycle: 'resolved' as const, resolvedAtMs: T0, resolvedByStaffId: 9 };
  const d = deriveOrderCheckInState(input({ item: resolvedItem, messages: [out(1, T0 - DAY)] }));
  assert.equal(d.state, 'resolved');
  assert.deepEqual(d.closure, { disposition: 'resolved', reason: null, closedAtMs: T0, closedByStaffId: 9 });
  assert.equal(d.contactMessageId, 1);

  const closure = { disposition: 'no_response_closed' as const, reason: 'Two chases, no answer', closedAtMs: T0, closedByStaffId: 4 };
  const n = deriveOrderCheckInState(input({ item: resolvedItem, storedClosure: closure }));
  assert.equal(n.state, 'no_response_closed');
  assert.deepEqual(n.closure, closure);
});

test('reopened after closure: closure cleared, state re-derived', () => {
  const closure = { disposition: 'resolved' as const, reason: null, closedAtMs: T0 - DAY, closedByStaffId: 4 };
  const d = deriveOrderCheckInState(input({ storedClosure: closure, messages: [out(1, T0 - 2 * DAY), inb(2, T0 - 1000)] }));
  assert.equal(d.state, 'staff_reply_due');
  assert.equal(d.closure, null);
});

test('collectCheckInContacts: oldest first; message-recording follow-ups merge; unproven messages drop their follow-ups', () => {
  const contacts = collectCheckInContacts(
    [out(1, 300), out(2, 100, 'copied')],
    [fu(10, 300, 'message', 1), fu(11, 200, 'email'), fu(12, 100, 'message', 2)],
  );
  assert.deepEqual(contacts, [
    { atMs: 200, messageId: null, followUpId: 11 },
    { atMs: 300, messageId: 1, followUpId: 10 },
  ]);
});
