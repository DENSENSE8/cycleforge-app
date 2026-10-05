import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrderCheckInView, SupportItemView, SupportMessageView } from '@/lib/support/conversation/model';
import {
  supportCanCloseNoResponse,
  supportCheckInFacts,
  supportComposerCommit,
  supportComposerMode,
  supportDismissBody,
  supportHeaderFlags,
  supportMessageCanDismiss,
  supportMessageCanMarkSent,
  supportMessageChip,
  supportNextStepPatch,
  supportResolveLabel,
  supportResolveRequest,
} from './support-record-model';

const ZENDESK = { connected: true, label: 'Zendesk' };
const EBAY = { connected: false, label: 'eBay' };

test('only an acknowledged customer conversation can reach the customer', () => {
  assert.equal(supportComposerMode('customer_conversation'), 'customer');
  assert.equal(supportComposerMode('internal_record'), 'internal_record');
  assert.equal(supportComposerMode('unclassified'), 'unclassified');
});

test('the commit names what reaches whom — never "Update ticket"', () => {
  assert.deepEqual(supportComposerCommit({ mode: 'customer', isPublic: true, transport: ZENDESK }), {
    kind: 'send',
    label: 'Send public reply',
    testId: 'support-send-public',
  });
  assert.deepEqual(supportComposerCommit({ mode: 'customer', isPublic: true, transport: EBAY }), {
    kind: 'copy_open',
    label: 'Copy & open eBay',
    testId: 'support-copy-open',
  });
  assert.deepEqual(supportComposerCommit({ mode: 'customer', isPublic: false, transport: ZENDESK }), {
    kind: 'internal',
    label: 'Add internal note',
    testId: 'support-add-internal',
  });
  for (const mode of ['customer', 'internal_record', 'unclassified'] as const) {
    for (const isPublic of [true, false]) {
      for (const transport of [ZENDESK, EBAY]) {
        assert.doesNotMatch(supportComposerCommit({ mode, isPublic, transport }).label, /Update ticket/);
      }
    }
  }
});

test('an internal record or unclassified item can never send or copy to a customer, even with Public set', () => {
  for (const transport of [ZENDESK, EBAY]) {
    const internal = supportComposerCommit({ mode: 'internal_record', isPublic: true, transport });
    assert.equal(internal.kind, 'internal');
    assert.equal(internal.label, 'Add internal update');
    const unclassified = supportComposerCommit({ mode: 'unclassified', isPublic: true, transport });
    assert.equal(unclassified.kind, 'internal');
    assert.equal(unclassified.label, 'Add internal note');
  }
});

const inbound = (over: Partial<SupportMessageView>): Pick<SupportMessageView, 'direction' | 'replyDisposition' | 'answeredByMessageId' | 'disposition' | 'deliveryState'> => ({
  direction: 'inbound',
  replyDisposition: 'pending',
  answeredByMessageId: null,
  disposition: null,
  deliveryState: null,
  ...over,
});

test('each inbound message reads pending, answered by #msg, or no reply required by <staff>', () => {
  assert.deepEqual(supportMessageChip(inbound({})), { tone: 'warning', label: 'Waiting for our reply' });
  assert.deepEqual(supportMessageChip(inbound({ replyDisposition: 'answered', answeredByMessageId: 88 })), {
    tone: 'success',
    label: 'Answered by #88',
  });
  assert.deepEqual(
    supportMessageChip(
      inbound({ replyDisposition: 'no_reply_required', disposition: { by: { id: 3, name: 'Ana' }, at: null, reason: 'Thanks only' } }),
    ),
    { tone: 'secondary', label: 'No reply required · Ana' },
  );
});

test('outbound delivery: only sent and logged read as delivered; copied waits for Mark sent', () => {
  const out = (deliveryState: SupportMessageView['deliveryState']) =>
    inbound({ direction: 'outbound', replyDisposition: null, deliveryState });
  assert.equal(supportMessageChip(out('sent'))?.label, 'Sent');
  assert.equal(supportMessageChip(out('logged'))?.label, 'Logged as sent');
  assert.equal(supportMessageChip(out('copied'))?.tone, 'warning');
  assert.equal(supportMessageChip(out('failed'))?.tone, 'destructive');
  assert.equal(supportMessageCanMarkSent({ direction: 'outbound', deliveryState: 'copied' }), true);
  assert.equal(supportMessageCanMarkSent({ direction: 'outbound', deliveryState: 'sent' }), false);
  assert.equal(supportMessageCanMarkSent({ direction: 'inbound', deliveryState: null }), false);
  assert.equal(supportMessageChip(inbound({ direction: 'internal', replyDisposition: null })), null);
});

test('"No reply required" is offered only on a pending inbound message and needs a reason', () => {
  assert.equal(supportMessageCanDismiss({ direction: 'inbound', replyDisposition: 'pending' }), true);
  assert.equal(supportMessageCanDismiss({ direction: 'inbound', replyDisposition: 'answered' }), false);
  assert.equal(supportMessageCanDismiss({ direction: 'outbound', replyDisposition: null }), false);
  assert.equal(supportDismissBody('   ').ok, false);
  assert.deepEqual(supportDismissBody('  Just a thank-you  '), {
    ok: true,
    body: { disposition: 'no_reply_required', reason: 'Just a thank-you' },
  });
});

test('next step: Follow up later needs its date; Waiting for customer does not', () => {
  assert.deepEqual(supportNextStepPatch('waiting_customer', null), {
    ok: true,
    body: { nextStep: 'waiting_customer', nextFollowUpAt: null },
  });
  // The optional waiting reminder rides along, so the wait can come due.
  assert.deepEqual(supportNextStepPatch('waiting_customer', '2026-10-07T16:00:00.000Z'), {
    ok: true,
    body: { nextStep: 'waiting_customer', nextFollowUpAt: '2026-10-07T16:00:00.000Z' },
  });
  assert.equal(supportNextStepPatch('follow_up_later', null).ok, false);
  assert.deepEqual(supportNextStepPatch('follow_up_later', '2026-10-06T16:00:00.000Z'), {
    ok: true,
    body: { nextStep: 'follow_up_later', nextFollowUpAt: '2026-10-06T16:00:00.000Z' },
  });
});

test('resolve is refused while blockers exist unless override AND a reason are given', () => {
  assert.deepEqual(supportResolveRequest({ blockers: [], override: false, reason: '' }), { ok: true, body: {} });
  assert.equal(supportResolveRequest({ blockers: ['unanswered_inbound'], override: false, reason: 'x' }).ok, false);
  assert.equal(supportResolveRequest({ blockers: ['unanswered_inbound'], override: true, reason: '   ' }).ok, false);
  assert.deepEqual(supportResolveRequest({ blockers: ['unanswered_inbound'], override: true, reason: ' Customer called ' }), {
    ok: true,
    body: { reason: 'Customer called', override: true },
  });
  // A clean resolve never claims an override.
  const clean = supportResolveRequest({ blockers: [], override: true, reason: 'done' });
  assert.deepEqual(clean, { ok: true, body: { reason: 'done' } });
});

test('Close — no response needs a reason and carries the check-in disposition', () => {
  assert.equal(supportResolveRequest({ blockers: [], override: false, reason: '', disposition: 'no_response_closed' }).ok, false);
  assert.deepEqual(
    supportResolveRequest({ blockers: [], override: false, reason: 'Two chases, no answer', disposition: 'no_response_closed' }),
    { ok: true, body: { reason: 'Two chases, no answer', checkInDisposition: 'no_response_closed' } },
  );
});

const checkIn = (over: Partial<OrderCheckInView> = {}): OrderCheckInView => ({
  orderId: 501,
  orderNumber: '12-34567-89012',
  state: 'contacted',
  triggerKind: 'delivered',
  triggerAt: '2026-10-01T18:00:00.000Z',
  dueAt: '2026-10-03T16:00:00.000Z',
  supportItemId: 9,
  taskId: 40,
  contactedAt: '2026-10-03T17:00:00.000Z',
  contactMessageId: 70,
  contactFollowUpId: 12,
  latestInboundMessageId: null,
  nextFollowUpAt: null,
  chaseCount: 0,
  disposition: null,
  dispositionReason: null,
  closedAt: null,
  closedBy: null,
  ...over,
});

test('Close — no response appears only on a live check-in after a chase', () => {
  assert.equal(supportCanCloseNoResponse(null), false);
  assert.equal(supportCanCloseNoResponse(checkIn({ contactedAt: null, chaseCount: 0, state: 'due' })), false);
  // Contacted but not yet chased: the one chase comes first (owner 2026-10-04).
  assert.equal(supportCanCloseNoResponse(checkIn()), false);
  assert.equal(supportCanCloseNoResponse(checkIn({ chaseCount: 1, state: 'follow_up_due' })), true);
  assert.equal(supportCanCloseNoResponse(checkIn({ chaseCount: 1, state: 'resolved' })), false);
  assert.equal(supportCanCloseNoResponse(checkIn({ chaseCount: 1, state: 'no_response_closed' })), false);
});

test('the resolve verb names an internal record', () => {
  assert.equal(supportResolveLabel({ purpose: 'internal_record' }), 'Resolve internal record');
  assert.equal(supportResolveLabel({ purpose: 'customer_conversation' }), 'Resolve');
});

test('header flags: Customer followed up replaces Needs reply; quiet flags stay off', () => {
  const flags = {
    unclassified: false,
    needs_reply: true,
    customer_followed_up: true,
    draft_ready: true,
    follow_up_due: false,
    unassigned: false,
    sync_failed: true,
  };
  assert.deepEqual(
    supportHeaderFlags(flags).map((f) => f.flag),
    ['customer_followed_up', 'draft_ready', 'sync_failed'],
  );
  assert.deepEqual(
    supportHeaderFlags({ ...flags, customer_followed_up: false, draft_ready: false, sync_failed: false }).map((f) => f.flag),
    ['needs_reply'],
  );
});

test('check-in facts: only what nothing else on the record says — products, dates, state', () => {
  const item: Pick<SupportItemView, 'checkIn' | 'primaryOrder'> = {
    checkIn: checkIn({ latestInboundMessageId: 71 }),
    primaryOrder: {
      orderId: 501,
      orderNumber: '12-34567-89012',
      platform: 'ebay',
      accountLabel: 'usav-main',
      primary: true,
      externalReference: null,
      customerName: 'Pat Doe',
      customerEmail: 'pat@example.com',
      products: [
        { orderLineId: 501, sku: 'A-1', title: 'SoundLink Mini', quantity: 1 },
        { orderLineId: 502, sku: 'B-2', title: 'Charger', quantity: 2 },
      ],
      fulfillment: { kind: 'delivered', at: '2026-10-01T18:00:00.000Z', trackingNumber: '1Z' },
    },
  };
  const facts = supportCheckInFacts(item, (iso) => iso.slice(0, 10));
  // The order, platform, customer, owners and the contact / reply state live elsewhere (table, header, thread).
  assert.deepEqual(
    facts.map((f) => f.id),
    ['products', 'trigger', 'due', 'state'],
  );
  const byId = Object.fromEntries(facts.map((f) => [f.id, f.value]));
  assert.equal(byId.products, 'SoundLink Mini, 2 × Charger');
  assert.equal(byId.trigger, '2026-10-01');
  assert.equal(facts.find((f) => f.id === 'trigger')?.label, 'Delivered');
  assert.equal(byId.due, '2026-10-03');
  assert.equal(byId.state, 'Contacted');
  // Not a check-in → no facts.
  assert.deepEqual(supportCheckInFacts({ ...item, checkIn: null }, String), []);
});
