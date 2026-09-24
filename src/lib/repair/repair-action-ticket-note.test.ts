import test from 'node:test';
import assert from 'node:assert/strict';
import {
  repairActionTicketNote,
  TICKET_POST_STALE_MS,
  ticketPostEligibility,
  ticketPostView,
  type TicketPostFacts,
} from './repair-action-ticket-note';
import type { RepairActionRecord } from './repair-actions';
import type { RepairTicketLink } from './ticket-link';

const NOW = Date.parse('2026-09-24T18:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const LINKED: RepairTicketLink = { state: 'linked', zendeskTicketId: 9998 };

const facts = (over: Partial<TicketPostFacts> = {}): TicketPostFacts => ({
  created_at: ago(1000),
  ticket_post_status: null,
  ticket_post_ticket_id: null,
  ticket_comment_id: null,
  ticket_post_error: null,
  ticket_post_attempted_at: null,
  ...over,
});

test('eligibility: only a linked ticket is posted to', () => {
  const others: RepairTicketLink[] = [
    { state: 'none' },
    { state: 'unverified', ticketNumber: '9998' },
    { state: 'ambiguous', zendeskTicketIds: [1, 2] },
    { state: 'internal', supportTicketId: 7 },
  ];
  for (const link of [...others, null]) {
    assert.deepEqual(ticketPostEligibility(link, facts(), NOW), { ok: false, reason: 'not-linked' });
  }
  assert.deepEqual(ticketPostEligibility(LINKED, facts(), NOW), { ok: true, ticketId: 9998 });
});

test('eligibility: never twice — a posted status or a stored comment id ends it', () => {
  assert.deepEqual(ticketPostEligibility(LINKED, facts({ ticket_post_status: 'posted' }), NOW), {
    ok: false,
    reason: 'posted',
  });
  assert.deepEqual(ticketPostEligibility(LINKED, facts({ ticket_post_status: 'failed', ticket_comment_id: 55 }), NOW), {
    ok: false,
    reason: 'posted',
  });
});

test('eligibility: a queued entry and a failed one may be posted', () => {
  assert.equal(ticketPostEligibility(LINKED, facts({ ticket_post_status: 'pending' }), NOW).ok, true);
  assert.equal(ticketPostEligibility(LINKED, facts({ ticket_post_status: 'failed' }), NOW).ok, true);
});

test('eligibility: an attempt inside the stale window blocks a second one; past it, it may be retried', () => {
  const fresh = facts({ ticket_post_status: 'pending', ticket_post_attempted_at: ago(TICKET_POST_STALE_MS - 1) });
  assert.deepEqual(ticketPostEligibility(LINKED, fresh, NOW), { ok: false, reason: 'in-flight' });
  const stale = facts({ ticket_post_status: 'pending', ticket_post_attempted_at: ago(TICKET_POST_STALE_MS) });
  assert.equal(ticketPostEligibility(LINKED, stale, NOW).ok, true);
});

test('view: posted names the ticket, failed carries the reason, queued is posting', () => {
  assert.deepEqual(ticketPostView(facts({ ticket_post_status: 'posted', ticket_post_ticket_id: 9998 }), NOW), {
    kind: 'posted',
    ticketId: 9998,
  });
  assert.deepEqual(ticketPostView(facts({ ticket_post_status: 'failed', ticket_post_error: 'HTTP 503' }), NOW), {
    kind: 'failed',
    error: 'HTTP 503',
  });
  assert.deepEqual(ticketPostView(facts({ ticket_post_status: 'pending' }), NOW), { kind: 'posting' });
  assert.equal(ticketPostView(facts(), NOW), null);
});

test('view: a pending post older than the stale window shows as failed so Retry is offered', () => {
  const view = ticketPostView(
    facts({ ticket_post_status: 'pending', created_at: ago(TICKET_POST_STALE_MS + 5000) }),
    NOW,
  );
  assert.equal(view?.kind, 'failed');
});

const action = (over: Partial<RepairActionRecord> = {}): RepairActionRecord => ({
  id: 12,
  repair_id: 4799,
  action_type: 'replaced',
  part_name: 'Power board',
  old_sku: 'PB-OLD',
  new_sku: 'PB-100',
  old_serial: 'S-OUT',
  new_serial: 'S-IN',
  duration_min: null,
  notes: 'Fuse was blown too.',
  staff_id: 1,
  staff_name: 'Michael',
  created_at: ago(0),
  session_id: null,
  donor_source: 'new_stock',
  donor_ref: null,
  component_ref: null,
  component_value: null,
  component_qty: null,
  stock_ledger_id: 3,
  stock_location_id: 40,
  stock_qty: 1,
  stock_bin_label: 'A-01-02',
  ticket_post_status: 'pending',
  ticket_post_ticket_id: 9998,
  ticket_comment_id: null,
  ticket_post_error: null,
  ticket_post_attempted_at: null,
  ...over,
});

test('note: a replacement names the repair, both parts with serials, the bin, the notes and the tech', () => {
  assert.equal(
    repairActionTicketNote(action()),
    [
      'Bench log · RS-4799 · Replaced a part — Power board',
      'Out: PB-OLD · SN S-OUT',
      'In: PB-100 · SN S-IN',
      'From: New stock (bin A-01-02)',
      '',
      'Fuse was blown too.',
      '',
      '— Michael',
    ].join('\n'),
  );
});

test('note: a component repair carries the reference, value and quantity; empty facts are omitted', () => {
  const note = repairActionTicketNote(
    action({
      action_type: 'repaired',
      part_name: null,
      old_sku: null,
      old_serial: null,
      new_sku: null,
      new_serial: null,
      donor_source: null,
      component_ref: 'C12',
      component_value: '470µF 16V',
      component_qty: 2,
      notes: null,
      staff_name: null,
    }),
  );
  assert.equal(note, ['Bench log · RS-4799 · Repaired a component', 'Ref: C12 470µF 16V × 2'].join('\n'));
});
