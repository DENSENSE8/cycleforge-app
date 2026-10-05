/** Deterministic draft validators — zero DB, zero network. Today in every case: Sunday 2026-10-04. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMarketplacePolicy } from '@/lib/support/conversation/marketplace-policy';
import { draftContext, draftFact, draftMessage, draftOrder } from './fixtures';
import {
  checkWeekdayDates,
  claimProofs,
  downgradeConfidence,
  findClaims,
  findProductDetailAsk,
  findUnbackedCommitments,
  findUnsourcedSchedules,
  findUnsupportedSpecifics,
  stripSignatureAndPlaceholders,
  stripToneFillers,
  validateSupportDraft,
} from './validate';

const TODAY = '2026-10-04';

// ── weekday / date ─────────────────────────────────────────────────────────

test('a weekday that matches its date passes; one that does not names the real weekday', () => {
  assert.deepEqual(checkWeekdayDates('It ships Monday, October 5.', TODAY), []);
  const [w] = checkWeekdayDates('It ships Monday, October 6.', TODAY);
  assert.match(w, /October 6, 2026 is a Tuesday, not a Monday/);
});

test('every pair in the draft is checked, abbreviated and numeric forms included', () => {
  const warnings = checkWeekdayDates('Pickup Tue Oct 6th works, or Fri 10/9; not Wed, 10/9.', TODAY);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Wed, 10\/9/);
});

test('"October 6 (Monday)" — date-first form is checked too', () => {
  assert.equal(checkWeekdayDates('Expect it October 6 (Monday).', TODAY).length, 1);
  assert.deepEqual(checkWeekdayDates('Expect it October 6 (Tuesday).', TODAY), []);
});

test('a yearless date resolves to the occurrence nearest today (Jan 4 = next January)', () => {
  // 2027-01-04 is a Monday; 2026-01-04 was a Sunday.
  assert.deepEqual(checkWeekdayDates('Back in stock Monday, January 4.', TODAY), []);
});

test('an explicit year is honoured', () => {
  assert.equal(checkWeekdayDates('Monday, October 5, 2027', TODAY).length, 1);
});

test('an impossible date is flagged', () => {
  assert.match(checkWeekdayDates('Friday, February 30', TODAY)[0], /not a real calendar date/);
});

test('relative days are checked against today', () => {
  assert.deepEqual(checkWeekdayDates('We will ship it tomorrow, Monday.', TODAY), []);
  assert.match(checkWeekdayDates('We will ship it tomorrow (Tuesday).', TODAY)[0], /tomorrow is Monday/);
  assert.match(checkWeekdayDates('As of today, Saturday, it is packed.', TODAY)[0], /today is Sunday/);
});

test('a past date written as upcoming is flagged; a past date as history is not', () => {
  assert.match(checkWeekdayDates('It will arrive by Monday, September 28.', TODAY)[0], /in the past/);
  assert.deepEqual(checkWeekdayDates('You contacted us on Monday, September 28.', TODAY), []);
});

// ── placeholders and signatures ────────────────────────────────────────────

test('a sign-off block is stripped; the reply itself is kept', () => {
  const out = stripSignatureAndPlaceholders('It shipped today.\n\nBest regards,\nMike\nUSAV Support Team', null);
  assert.equal(out.body, 'It shipped today.');
  assert.equal(out.removed.length, 1);
  assert.deepEqual(out.placeholders, []);
});

test('a team-only signature and placeholder-only lines are stripped', () => {
  const out = stripSignatureAndPlaceholders('Your unit is on the bench.\n[Your Name]\n— The Support Team', null);
  assert.equal(out.body, 'Your unit is on the bench.');
});

test('a greeting placeholder is filled from the requester name, never invented', () => {
  assert.equal(stripSignatureAndPlaceholders('Hi [Customer Name],\nThanks for writing.', 'Dana Ortiz').body, 'Hi Dana,\nThanks for writing.');
  assert.equal(stripSignatureAndPlaceholders('Hi [Name],\nThanks for writing.', null).body, 'Hi,\nThanks for writing.');
});

test('a placeholder inside a sentence is reported, not guessed', () => {
  const out = stripSignatureAndPlaceholders('Your tracking number is [tracking number].', null);
  assert.deepEqual(out.placeholders, ['[tracking number]']);
  assert.equal(out.body, 'Your tracking number is [tracking number].');
});

test('"Thank you!" closing a sentence is not a signature', () => {
  const body = 'We received the return and will inspect it Monday.\nThank you!';
  assert.equal(stripSignatureAndPlaceholders(body, null).body, body);
});

test('policy markers like [link removed] are not placeholders', () => {
  assert.deepEqual(stripSignatureAndPlaceholders('See the manual [link removed].', null).placeholders, []);
});

// ── completed-action claims ────────────────────────────────────────────────

test('completed-action claims are found; plans and conditionals are not', () => {
  assert.deepEqual(findClaims('Your refund has been issued.'), ['refund']);
  assert.deepEqual(findClaims('We have shipped your order.'), ['shipped']);
  assert.deepEqual(findClaims('Your amplifier has been repaired.'), ['repaired']);
  assert.deepEqual(findClaims('A replacement has been sent.'), ['replaced']);
  assert.deepEqual(findClaims('We will issue a refund once it arrives.'), []);
  assert.deepEqual(findClaims('Once it has shipped, you will get tracking.'), []);
  assert.deepEqual(findClaims('It has not been shipped yet.'), []);
});

test('an unproven claim is a severe warning; a record or staff note proves it', () => {
  const unproven = validateSupportDraft({ body: 'Good news — your order has shipped.', kind: 'reply', context: draftContext() });
  assert.equal(unproven.severe, true);
  assert.match(unproven.warnings.join(' '), /Says the item shipped/);

  const shippedOrder = draftContext({ orders: [draftOrder({ fulfillment: { kind: 'shipped', at: '2026-10-03', trackingNumber: '1Z999AA10123456784' } })] });
  assert.equal(validateSupportDraft({ body: 'Good news — your order has shipped.', kind: 'reply', context: shippedOrder }).severe, false);

  const noted = draftContext({
    messages: [
      draftMessage({ direction: 'internal', body: 'Refund has been issued in eBay, $120.' }),
      draftMessage({ direction: 'inbound', body: 'Did you refund me?' }),
    ],
  });
  assert.equal(claimProofs(noted).refund, 'Internal note');
  assert.equal(validateSupportDraft({ body: 'Yes, your refund has been issued.', kind: 'reply', context: noted }).severe, false);
});

test("the customer's own words never prove our action", () => {
  const ctx = draftContext({ messages: [draftMessage({ direction: 'inbound', body: 'You said my refund has been issued but I see nothing.' })] });
  assert.equal(claimProofs(ctx).refund, undefined);
});

test('a Done repair fact proves repaired', () => {
  const ctx = draftContext({ facts: [draftFact({ text: 'Repair RS-1: status Done.', proves: ['repaired'] })] });
  assert.equal(validateSupportDraft({ body: 'Your unit has been repaired.', kind: 'reply', context: ctx }).severe, false);
});

// ── identifiers and order numbers ──────────────────────────────────────────

test('an order or tracking number in no record is flagged as invented', () => {
  const out = validateSupportDraft({ body: 'Your tracking number is 1Z999AA10123456784.', kind: 'reply', context: draftContext() });
  assert.equal(out.severe, true);
  assert.match(out.warnings.join(' '), /1Z999AA10123456784/);
  const known = validateSupportDraft({ body: 'Order 12-34567-89012 is packed.', kind: 'reply', context: draftContext() });
  assert.equal(known.severe, false);
});

test('an order question with no linked order is a missing fact', () => {
  const out = validateSupportDraft({ body: 'Could you share your order number?', kind: 'reply', context: draftContext({ orders: [] }) });
  assert.match(out.missingFacts.join(' '), /Order number/);
});

test('asking for an order number the record already has is a warning', () => {
  const out = validateSupportDraft({ body: 'Could you send us your order number so we can check?', kind: 'reply', context: draftContext() });
  assert.match(out.warnings.join(' '), /already linked/);
});

test('asking for the model / SKU a linked order line already names is a warning; asking for a photo is not', () => {
  const ask = 'Please provide the bracket model or dimensions so we can verify the required length.';
  assert.equal(findProductDetailAsk(ask), ask);
  assert.equal(findProductDetailAsk('Could you send us a photo of the short screw?'), null);
  assert.equal(findProductDetailAsk('The UB-20 model takes the longer screw.'), null);
  const out = validateSupportDraft({ body: ask, kind: 'reply', context: draftContext() });
  assert.match(out.warnings.join(' '), /already names it: Studio Amplifier 200 \(SKU AMP-200\)/);
  const unlinked = validateSupportDraft({ body: ask, kind: 'reply', context: draftContext({ orders: [] }) });
  assert.doesNotMatch(unlinked.warnings.join(' '), /model \/ SKU/);
});

// ── confidence ─────────────────────────────────────────────────────────────

test('severe caps at low, other findings at medium, applied fixes do not lower it', () => {
  assert.equal(downgradeConfidence('high', { severe: true, warnings: ['x'], missingFacts: [] }), 'low');
  assert.equal(downgradeConfidence('high', { severe: false, warnings: [], missingFacts: ['Order number'] }), 'medium');
  assert.equal(downgradeConfidence('low', { severe: false, warnings: ['x'], missingFacts: [] }), 'low');
  const signed = validateSupportDraft({ body: 'It is in final testing now.\n\nBest regards,\nMike', kind: 'reply', context: draftContext() });
  assert.deepEqual(signed.warnings, []);
  assert.equal(signed.fixes.length, 1);
  assert.equal(downgradeConfidence('high', signed), 'high');
});

// ── unsupported specifics ──────────────────────────────────────────────────

const SCREWS_Q = 'One of the brackets is missing the screws for the speaker plate. Can you send the screws, or what size do I need?';

test('sizes, quantities, prices, time frames, dates and model numbers need a source', () => {
  assert.deepEqual(
    findUnsupportedSpecifics(
      'You will need 6 x 1/4" screws (M4, #6-32), about $15, in 3-5 business days, by October 9, model KDC-X304, 12 V.',
      [SCREWS_Q],
    ),
    ['6 x 1/4"', 'M4', '#6-32', '$15', '3-5 business days', 'October 9', 'KDC-X304', '12 V'],
  );
});

test('a specific is supported when any source states it, however it is spaced or written', () => {
  const sources = ['Speaker plate: 4 x M4 screws, 1/4 inch long. Ships 10/9.', 'SKU AMP-200', '2026-10-02'];
  assert.deepEqual(findUnsupportedSpecifics('Use 4x M4 screws, 1/4" long; ships October 9 (AMP-200), shipped Oct 2.', sources), []);
  // The digits of a sourced model number are not a part count ("UB-20 bracket", live draft 5).
  assert.deepEqual(findUnsupportedSpecifics('We will check the UB-20 bracket.', ['Mounting Screw - UB-20']), []);
});

test('time frames in words need a source; rates and pleasantries are not time frames', () => {
  assert.deepEqual(findUnsupportedSpecifics('Please allow us a day, or a few more days, by Friday.', []), ['a day', 'a few more days', 'by Friday']);
  assert.deepEqual(findUnsupportedSpecifics('Charge it once a day. Have a great day!', []), []);
  assert.deepEqual(findUnsupportedSpecifics('It ships by Monday.', ['Final test Monday 10/5']), []);
});

test('a ship / arrival schedule needs a staff note, a record fact, or (for arrival) a shipped order', () => {
  const ctx = draftContext();
  assert.deepEqual(findUnsourcedSchedules('Your amplifier is currently scheduled to ship soon. Thanks!', ctx), [
    'Your amplifier is currently scheduled to ship soon.',
  ]);
  assert.equal(findUnsourcedSchedules('It will ship tomorrow.', ctx).length, 1);
  assert.deepEqual(findUnsourcedSchedules('We will ship it as soon as it passes testing.', ctx), []);
  assert.deepEqual(findUnsourcedSchedules('It should ship Monday, October 5.', ctx), []);
  const noted = draftContext({ messages: [draftMessage({ direction: 'internal', body: 'Ships Monday.' })] });
  assert.deepEqual(findUnsourcedSchedules('It will ship soon.', noted), []);
  const shipped = draftContext({ orders: [draftOrder({ fulfillment: { kind: 'shipped', at: '2026-10-02', trackingNumber: null } })] });
  assert.deepEqual(findUnsourcedSchedules('It should arrive soon.', shipped), []);
});

test('the customer\u2019s own numbers, order lines and record dates are sources', () => {
  const ctx = draftContext({
    messages: [draftMessage({ direction: 'inbound', body: 'I measured the gap: 2 mm. Bought on 9/20.' })],
    orders: [draftOrder({ fulfillment: { kind: 'shipped', at: '2026-10-02', trackingNumber: null } })],
  });
  const out = validateSupportDraft({ body: 'A 2 mm gap is normal; your order went out October 2 after you bought it September 20.', kind: 'reply', context: ctx });
  assert.equal(out.severe, false, out.warnings.join(' | '));
});

test('retrieved RAG text counts as a source (extraSources)', () => {
  const ctx = draftContext();
  const body = 'The speaker plate uses M4 screws.';
  assert.equal(validateSupportDraft({ body, kind: 'reply', context: ctx }).severe, true);
  assert.equal(validateSupportDraft({ body, kind: 'reply', context: ctx, extraSources: ['Plate fasteners: M4 x 10'] }).severe, false);
});

test('an unsupported specific is severe, named in the warning, and a missing fact', () => {
  const out = validateSupportDraft({ body: 'You will need 6 x 1/4" screws.', kind: 'reply', context: draftContext({ messages: [draftMessage({ direction: 'inbound', body: SCREWS_Q })] }) });
  assert.equal(out.severe, true);
  assert.match(out.warnings.join(' '), /States "6 x 1\/4""/);
  assert.deepEqual(out.missingFacts, ['A source for "6 x 1/4""']);
  assert.equal(downgradeConfidence('medium', out), 'low');
});

// ── tone ───────────────────────────────────────────────────────────────────

test('a leading apology sentence is removed when the rest stands; a greeting line is kept', () => {
  const out = stripToneFillers('Hi Dana,\nWe apologize for the missing screws. We are checking the parts bin now.');
  assert.equal(out.body, 'Hi Dana,\nWe are checking the parts bin now.');
  assert.equal(out.removed.length, 1);
});

test('an apology that is the whole reply is a warning, not a deletion', () => {
  const out = stripToneFillers('We are so sorry about this.');
  assert.equal(out.body, 'We are so sorry about this.');
  assert.equal(out.warnings.length, 1);
});

test('an acknowledgement opener that contains an apology is a warning', () => {
  assert.match(stripToneFillers('Thanks for letting us know, and sorry for the trouble. We are checking.').warnings[0], /Opens with an apology/);
});

test('"let us know when you\u2019re ready" is removed; "let us know if you need anything" is kept', () => {
  assert.equal(stripToneFillers("We are checking now. Let us know when you're ready to proceed.").body, 'We are checking now.');
  assert.equal(stripToneFillers('We are checking now. Let us know if you need anything.').body, 'We are checking now. Let us know if you need anything.');
});

test('contact-us on a conversation the customer started is a warning; a check-in may invite a reply', () => {
  const reply = validateSupportDraft({ body: 'Please contact us and we will look into it.', kind: 'reply', context: draftContext() });
  assert.match(reply.warnings.join(' '), /Asks the customer to contact us/);
  const checkIn = validateSupportDraft({
    body: 'How is everything working? Feel free to reach out if you need anything.',
    kind: 'check_in',
    context: draftContext({ item: { kind: 'post_purchase_check_in' }, messages: [] }),
  });
  assert.doesNotMatch(checkIn.warnings.join(' '), /contact us/);
});

// ── commitments ────────────────────────────────────────────────────────────

test('a promise to send / refund / replace with nothing backing it is flagged', () => {
  const ctx = draftContext({ messages: [draftMessage({ direction: 'inbound', body: SCREWS_Q })] });
  assert.deepEqual(findUnbackedCommitments('Please contact us and we will send the missing screws immediately.', ctx), [
    'we will send the missing screws immediately',
  ]);
  assert.equal(findUnbackedCommitments("We'll refund you once it is back. Your refund will be processed.", ctx).length, 2);
  assert.deepEqual(findUnbackedCommitments('We will check whether we have spares and follow up.', ctx), []);
  // A promise reached through "and" / "to" is still a promise (live eval, 2026-10-04).
  assert.deepEqual(
    findUnbackedCommitments('We will check the product details to confirm the required screw size and send them to you.', ctx),
    ['We will check the product details to confirm the required screw size and send them to you'],
  );
  assert.equal(findUnbackedCommitments('We will check the details of your issue to process your refund.', ctx).length, 1);
  // Nouns are not promises.
  assert.deepEqual(findUnbackedCommitments('We will check the shipping status and the repair history.', ctx), []);
  assert.deepEqual(findUnbackedCommitments('We will look into the issue and follow up.', ctx), []);
  // Sending information is not a promise of goods (live eval, 2026-10-04).
  assert.deepEqual(
    findUnbackedCommitments('We will check the product details to confirm the screw size and send you the correct information.', ctx),
    [],
  );
  // Promising the right part by other words is still a promise (live draft 5, 2026-10-04).
  assert.equal(
    findUnbackedCommitments('We will check the correct screw length and follow up with the right size.', ctx).length,
    1,
  );
  assert.equal(findUnbackedCommitments('We will send you the correct screw.', ctx).length, 1);
  assert.equal(findUnbackedCommitments("We'll get a longer one out to you.", ctx).length, 1);
  assert.deepEqual(findUnbackedCommitments('We will follow up once we have checked.', ctx), []);
  assert.deepEqual(findUnbackedCommitments('We will follow up with the correct information.', ctx), []);
  assert.deepEqual(findUnbackedCommitments("We'll get back to you tomorrow.", ctx), []);
});

test('a staff note, an open repair, or an unshipped linked order backs the matching promise', () => {
  const noted = draftContext({ messages: [draftMessage({ direction: 'internal', body: 'OK to send a screw kit.' })] });
  assert.deepEqual(findUnbackedCommitments('We will send a set of screws.', noted), []);
  const repair = draftContext({ facts: [draftFact({ text: 'Repair RS-1: status Pending Repair.' })] });
  assert.deepEqual(findUnbackedCommitments('We will repair it this week.', repair), []);
  assert.deepEqual(findUnbackedCommitments('We will ship your order as soon as it passes testing.', draftContext()), []);
  assert.equal(findUnbackedCommitments('We will ship you a replacement.', draftContext()).length, 1);
});

test('a commitment warning does not by itself make the draft severe', () => {
  const out = validateSupportDraft({ body: 'We will send the screws.', kind: 'reply', context: draftContext() });
  assert.equal(out.severe, false);
  assert.match(out.warnings.join(' '), /^Commits to "We will send the screws"/);
  assert.equal(downgradeConfidence('high', out), 'medium');
});

// ── marketplace policy (PROVIDERS' deterministic rewrite) ──────────────────

test('eBay: links, emails and phone numbers never survive; email channel keeps them', () => {
  const body = 'See https://example.com/manual or email help@example.com, or call (555) 123-4567.';
  const ebay = applyMarketplacePolicy('ebay', body);
  assert.doesNotMatch(ebay.body, /https?:|@example\.com|555/);
  assert.ok(ebay.changes.includes('links_removed'));
  assert.equal(applyMarketplacePolicy('email', body).body, body);
});
