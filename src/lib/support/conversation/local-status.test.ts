import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORT_CLOSED_AFTER_DAYS, supportLocalStatus, type SupportLocalStatusFacts } from './model';

const NOW = Date.parse('2026-10-04T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function facts(over: Partial<SupportLocalStatusFacts> = {}): SupportLocalStatusFacts {
  return { purpose: 'customer_conversation', lifecycle: 'open', pendingInboundCount: 1, lastOutboundAt: null, resolvedAt: null, ...over };
}

test('an item no reply ever went out on is New, classified or not', () => {
  assert.equal(supportLocalStatus(facts(), NOW), 'new');
  assert.equal(supportLocalStatus(facts({ purpose: 'unclassified' }), NOW), 'new');
});

test('answered once, then the customer writes again: Open, never back to New', () => {
  assert.equal(supportLocalStatus(facts({ lastOutboundAt: '2026-10-03T10:00:00Z', pendingInboundCount: 1 }), NOW), 'open');
  assert.equal(supportLocalStatus(facts({ lastOutboundAt: '2026-10-03T10:00:00Z', pendingInboundCount: 0 }), NOW), 'open');
});

test('an internal record has no customer to answer: it is Open while live', () => {
  assert.equal(supportLocalStatus(facts({ purpose: 'internal_record', pendingInboundCount: 0 }), NOW), 'open');
});

test('waiting on the customer is Pending until the customer writes back', () => {
  const waiting = facts({ lifecycle: 'waiting_customer', lastOutboundAt: '2026-10-03T10:00:00Z', pendingInboundCount: 0 });
  assert.equal(supportLocalStatus(waiting, NOW), 'pending');
  assert.equal(supportLocalStatus({ ...waiting, pendingInboundCount: 1 }, NOW), 'open');
});

test('snoozed is On-hold whatever is pending', () => {
  assert.equal(supportLocalStatus(facts({ lifecycle: 'snoozed' }), NOW), 'on_hold');
  assert.equal(supportLocalStatus(facts({ lifecycle: 'snoozed', pendingInboundCount: 0, lastOutboundAt: '2026-10-01T00:00:00Z' }), NOW), 'on_hold');
});

test(`resolved is Solved for ${SUPPORT_CLOSED_AFTER_DAYS} days, then Closed`, () => {
  const resolved = (msAgo: number) => facts({ lifecycle: 'resolved', pendingInboundCount: 0, resolvedAt: new Date(NOW - msAgo).toISOString() });
  assert.equal(supportLocalStatus(resolved(0), NOW), 'solved');
  assert.equal(supportLocalStatus(resolved(SUPPORT_CLOSED_AFTER_DAYS * DAY - 1), NOW), 'solved');
  assert.equal(supportLocalStatus(resolved(SUPPORT_CLOSED_AFTER_DAYS * DAY), NOW), 'closed');
  assert.equal(supportLocalStatus(resolved(30 * DAY), NOW), 'closed');
});

test('a resolved item with no resolution time is Solved, never silently Closed', () => {
  assert.equal(supportLocalStatus(facts({ lifecycle: 'resolved', resolvedAt: null }), NOW), 'solved');
});
