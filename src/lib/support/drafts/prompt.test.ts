/** Context → prompt assembly — pure, no network. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextCitations, draftKindFor } from './context';
import { draftContext, draftFact, draftMessage, draftOrder } from './fixtures';
import { buildSupportDraftPrompt, unansweredInbound } from './prompt';

test('today is stated with its weekday, so the model can date things correctly', () => {
  const { user } = buildSupportDraftPrompt({ context: draftContext(), kind: 'reply' });
  assert.match(user, /Today: Sunday, October 4, 2026 \(2026-10-04\)\./);
});

test('the conversation is labelled by direction; internal notes are marked never-quote', () => {
  const context = draftContext({
    messages: [
      draftMessage({ direction: 'inbound', body: 'Where is my amp?', occurredAt: '2026-09-30T10:00:00Z' }),
      draftMessage({ direction: 'outbound', body: 'It ships Monday.', occurredAt: '2026-09-30T12:00:00Z' }),
      draftMessage({ direction: 'internal', body: 'Waiting on a part from the vendor.', occurredAt: '2026-10-01T09:00:00Z' }),
      draftMessage({ direction: 'inbound', body: 'Still no tracking?', occurredAt: '2026-10-03T09:00:00Z' }),
    ],
  });
  const { user, system } = buildSupportDraftPrompt({ context, kind: 'reply' });
  assert.match(user, /\[2026-09-30\] Customer: Where is my amp\?\n\n\[2026-09-30\] Us: It ships Monday\./);
  assert.match(user, /INTERNAL NOTE \(never quote\): Waiting on a part/);
  assert.match(system, /Internal notes are for your understanding only/);
  // The message being answered appears once, under its own heading.
  assert.equal(user.split('Still no tracking?').length - 1, 1);
  assert.match(user, /Latest customer message \(the one you are answering\):\nStill no tracking\?/);
});

test('every customer message since our last delivered reply is answered together', () => {
  const messages = [
    draftMessage({ direction: 'inbound', body: 'First question' }),
    draftMessage({ direction: 'outbound', body: 'Prepared reply', deliveryState: 'copied' }),
    draftMessage({ direction: 'inbound', body: 'Second question' }),
  ];
  assert.deepEqual(unansweredInbound(messages).map((m) => m.body), ['First question', 'Second question']);
  const { user } = buildSupportDraftPrompt({ context: draftContext({ messages }), kind: 'reply' });
  assert.match(user, /Customer messages since our last reply \(answer all of them\)/);
  assert.match(user, /Us \(prepared, not confirmed sent\): Prepared reply/);
});

test('linked orders and records are listed; no order says so explicitly', () => {
  const withRecords = buildSupportDraftPrompt({
    context: draftContext({ facts: [draftFact({ text: 'Repair RS-1: Studio Amplifier 200; status Pending Repair.' })] }),
    kind: 'reply',
  }).user;
  assert.match(
    withRecords,
    /Linked orders \(already known — never ask the customer for the order number\):\n- Order 12-34567-89012 \(ebay\) \[primary\]: Studio Amplifier 200 \(SKU AMP-200\); not shipped yet\./,
  );
  // The rules small models break most are restated last, right before the ask.
  assert.match(withRecords, /Write the reply to the customer now: one short paragraph; .*no promise to send.*do not ask for the order number; do not ask them to contact us\.$/);
  assert.match(withRecords, /Repairs:\n- Repair RS-1/);
  const none = buildSupportDraftPrompt({ context: draftContext({ orders: [] }), kind: 'reply' }).user;
  assert.match(none, /Linked orders: none/);
});

test('past resolved replies are framed as tone only, never as facts about this customer', () => {
  const { user } = buildSupportDraftPrompt({
    context: draftContext({
      facts: [draftFact({ citation: { type: 'past_reply', label: 'Resolved conversation #9', ref: 'thread_messages:9' }, text: '"We re-seated the ribbon cable."' })],
    }),
    kind: 'reply',
  });
  assert.match(user, /tone and approach only — their facts are NOT about this customer/);
});

test('the channel adapts the rules: marketplace forbids off-platform contact; email allows a greeting', () => {
  const ebay = buildSupportDraftPrompt({ context: draftContext(), kind: 'reply' }).system;
  assert.match(ebay, /eBay messaging: no links, no email addresses, no phone numbers/);
  assert.match(ebay, /2000 characters/);
  const email = buildSupportDraftPrompt({ context: draftContext({ item: { channel: 'email' } }), kind: 'reply' }).system;
  assert.match(email, /email-style reply/);
  assert.doesNotMatch(email, /no links/);
});

test('the reply standard: one paragraph, answer first, no invented specifics or promises, no apology/contact-us/filler', () => {
  const { system } = buildSupportDraftPrompt({ context: draftContext(), kind: 'reply' });
  assert.match(system, /Write ONE short paragraph/);
  assert.match(system, /Your first sentence answers the customer\u2019s actual question directly/);
  assert.match(system, /Never state a part size, quantity, measurement, spec/);
  assert.match(system, /Never promise to send, ship, refund, replace or repair anything unless a fact or staff note/);
  assert.match(system, /Never say an action happened/);
  assert.match(system, /Do not open with an apology\. Never ask the customer to contact us/);
  assert.match(system, /let us know when you\u2019re ready/);
  assert.match(system, /no signature, no sign-off, no \[placeholders\]/);
  assert.match(system, /Ask only for information genuinely missing/);
});

test('a check-in item with no inbound yet drafts a check-in from facts only', () => {
  const context = draftContext({
    item: { kind: 'post_purchase_check_in' },
    messages: [],
    orders: [draftOrder({ fulfillment: { kind: 'delivered', at: '2026-10-01', trackingNumber: null } })],
  });
  assert.equal(draftKindFor(context.item.kind, context.messages), 'check_in');
  const { system, user } = buildSupportDraftPrompt({ context, kind: 'check_in' });
  assert.match(system, /post-purchase check-in/);
  assert.match(system, /State nothing about delivery, refunds, replacements, repairs or warranty beyond what the facts list/);
  assert.match(user, /has not written to us about this order yet/);
  assert.match(user, /Write the check-in message now: one short paragraph, facts only\.$/);
  // Once the customer writes, the item calls for a reply instead.
  assert.equal(draftKindFor('post_purchase_check_in', [draftMessage({ direction: 'inbound', body: 'All good' })]), 'reply');
});

test('every fact the prompt uses has a citation', () => {
  const context = draftContext({ facts: [draftFact({ text: 'Repair RS-1: status Done.' })] });
  const citations = contextCitations(context);
  assert.deepEqual(
    citations.map((c) => c.type),
    ['thread', 'order', 'repair'],
  );
  assert.equal(citations[1].ref, 'orders:501');
});
