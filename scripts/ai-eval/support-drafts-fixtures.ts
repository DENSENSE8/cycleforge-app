/**
 * Support-draft eval fixtures.
 *
 * DETERMINISTIC cases hand the pipeline a fixed "model output" and pin what the
 * validators + channel policy must do with it (the tricky drafts a model really
 * writes: wrong weekdays, sign-offs, placeholders, promised refunds, invented
 * tracking, links on eBay).
 *
 * LIVE cases hand the org's model a context and score its draft against the
 * drafting rules. Today in every fixture: Sunday 2026-10-04.
 */
import type { SupportDraftConfidence, SupportDraftKind } from '@/lib/support/conversation/model';
import type { SupportDraftContext } from '@/lib/support/drafts/context';
import { draftContext, draftFact, draftMessage, draftOrder } from '@/lib/support/drafts/fixtures';

export interface DeterministicDraftCase {
  name: string;
  kind: SupportDraftKind;
  context: SupportDraftContext;
  /** What the "model" wrote. */
  draft: string;
  expect: {
    severe: boolean;
    warnings?: RegExp[];
    /** No problem warnings at all (fixes and policy notes allowed). */
    clean?: boolean;
    missingFacts?: RegExp[];
    bodyIncludes?: RegExp[];
    bodyExcludes?: RegExp[];
    confidence?: SupportDraftConfidence;
  };
}

const shippedOrder = draftOrder({ fulfillment: { kind: 'shipped', at: '2026-10-02', trackingNumber: '1Z999AA10123456784' } });
const deliveredOrder = draftOrder({ fulfillment: { kind: 'delivered', at: '2026-10-01', trackingNumber: '1Z999AA10123456784' } });
const checkInContext = (orders = [deliveredOrder]) =>
  draftContext({ item: { kind: 'post_purchase_check_in', channel: 'email' }, messages: [], orders });
/** Staff noted the ship date: "October 5" is now sourced. */
const testingNoteContext = (over: Parameters<typeof draftContext>[0] = {}) =>
  draftContext({
    messages: [
      draftMessage({ direction: 'inbound', body: 'Hi, when will my amplifier ship?' }),
      draftMessage({ direction: 'internal', body: 'Final test Monday 10/5; ships the same day.' }),
    ],
    ...over,
  });
/** The browser-proof conversation (item 595): missing screws, nothing on record about screws. */
const screwsContext = (over: Parameters<typeof draftContext>[0] = {}) =>
  draftContext({
    item: { channel: 'email' },
    orders: [deliveredOrder],
    messages: [
      draftMessage({
        direction: 'inbound',
        body: 'One of the brackets is missing the screws for the speaker plate. Can you send the screws, or what size do I need?',
      }),
    ],
    ...over,
  });
/** Live draft 5 (item 598): one mounting screw too short; the order line names the bracket (UB-20). */
const shortScrewContext = (over: Parameters<typeof draftContext>[0] = {}) =>
  draftContext({
    item: { channel: 'email' },
    orders: [
      draftOrder({
        orderNumber: '06-15257-43461',
        products: [{ orderLineId: 598, sku: null, title: 'Bose Jewel Double Cube Speaker - Mounting Screw - UB-20', quantity: 4 }],
        fulfillment: { kind: 'delivered', at: '2026-10-01', trackingNumber: null },
      }),
    ],
    messages: [
      draftMessage({
        direction: 'inbound',
        body: 'Hi, the mounting screw kit arrived but one of the four screws is too short to reach the bracket. Can you send the right length? (E2E proof)',
      }),
    ],
    ...over,
  });

export const DETERMINISTIC_CASES: DeterministicDraftCase[] = [
  {
    name: 'weekday/date mismatch ("Monday, October 6" — the 6th is a Tuesday)',
    kind: 'reply',
    context: draftContext(),
    draft: 'It will ship Monday, October 6 once the last test passes.',
    expect: { severe: true, warnings: [/Tuesday, not a Monday/], confidence: 'low' },
  },
  {
    name: 'correct weekday/date pair with a sourced date passes',
    kind: 'reply',
    context: testingNoteContext(),
    draft: 'It is in final testing and should ship Monday, October 5.',
    expect: { severe: false, clean: true },
  },
  {
    name: 'a correct weekday/date pair no source mentions is still an invented date',
    kind: 'reply',
    context: draftContext(),
    draft: 'It is in final testing and should ship Monday, October 5.',
    expect: { severe: true, warnings: [/"October 5"/], missingFacts: [/October 5/], confidence: 'low' },
  },
  {
    name: 'browser proof #1 (item 595): apology, contact-us, invented screw size, unbacked commitment, filler',
    kind: 'reply',
    context: screwsContext(),
    draft:
      'We apologize for the missing screws in your order. Please contact us and we will send the missing screws immediately. You will need 6 x 1/4" screws for the speaker plate. Let us know when you\'re ready to proceed.',
    expect: {
      severe: true,
      warnings: [/States "6 x 1\/4"/, /Commits to "we will send the missing screws immediately"/, /contact us/],
      missingFacts: [/6 x 1\/4"/],
      bodyExcludes: [/apologize/i, /when you're ready/i],
      confidence: 'low',
    },
  },
  {
    name: 'a screw size quoted from the product manual is supported',
    kind: 'reply',
    context: screwsContext({
      facts: [
        draftFact({
          citation: { type: 'manual', label: 'Manual: Studio Amplifier 200', ref: 'product_manuals:3' },
          text: 'Speaker plate mounting: 4 x M4 screws, 10 mm long.',
        }),
      ],
    }),
    draft: 'The speaker plate takes 4 x M4 screws, 10 mm long. We will check whether we have spares on hand and follow up today.',
    expect: { severe: false, clean: true },
  },
  {
    name: 'a commitment a staff note backs is not flagged',
    kind: 'reply',
    context: screwsContext({
      messages: [
        draftMessage({ direction: 'inbound', body: 'One of the brackets is missing the screws. Can you send them?' }),
        draftMessage({ direction: 'internal', body: 'OK to send a screw kit from the parts bin — Mike' }),
      ],
    }),
    draft: 'Yes — we will send a set of screws for the speaker plate.',
    expect: { severe: false, clean: true },
  },
  {
    name: 'invented price and return window',
    kind: 'reply',
    context: screwsContext(),
    draft: 'A replacement bracket is $15, and you can return the amplifier within 30 days.',
    expect: { severe: true, warnings: [/"\$15"/, /"30 days"/] },
  },
  {
    name: 'leading apology removed when the rest stands; a needless closer removed',
    kind: 'reply',
    context: testingNoteContext(),
    draft: "We're sorry for the wait. It is in final testing and should ship Monday, October 5. Let us know when you're ready.",
    expect: { severe: false, clean: true, bodyExcludes: [/sorry/i, /ready/i], bodyIncludes: [/^It is in final testing/] },
  },
  {
    name: '"reach out to us" while the customer is already writing to us',
    kind: 'reply',
    context: testingNoteContext(),
    draft: 'It is in final testing now. Please reach out to us if you have questions.',
    expect: { severe: false, warnings: [/contact us/] },
  },
  {
    name: '"tomorrow" named with the wrong weekday',
    kind: 'reply',
    context: draftContext(),
    draft: 'We expect to ship it tomorrow, Tuesday.',
    expect: { severe: true, warnings: [/tomorrow is Monday/] },
  },
  {
    name: 'past date offered as upcoming',
    kind: 'reply',
    context: draftContext(),
    draft: 'It should arrive by Thursday, October 1.',
    expect: { severe: true, warnings: [/in the past/] },
  },
  {
    name: 'sign-off and team signature stripped, not penalised',
    kind: 'reply',
    context: testingNoteContext(),
    draft: 'It is in final testing and should ship Monday, October 5.\n\nBest regards,\nMike\nThe Support Team',
    expect: { severe: false, clean: true, bodyExcludes: [/regards/i, /Support Team/] },
  },
  {
    name: 'inline placeholder left by the model',
    kind: 'reply',
    context: draftContext(),
    draft: 'Your tracking number is [tracking number] and it ships soon.',
    expect: { severe: true, warnings: [/placeholder/], missingFacts: [/tracking number/] },
  },
  {
    name: 'greeting placeholder filled from the record',
    kind: 'reply',
    context: testingNoteContext({ item: { channel: 'email' } }),
    draft: 'Hi [Customer Name],\nIt should ship Monday, October 5.',
    expect: { severe: false, bodyIncludes: [/^Hi Dana,/] },
  },
  {
    name: 'refund claimed with no source',
    kind: 'reply',
    context: draftContext({ messages: [draftMessage({ direction: 'inbound', body: 'Can I get a refund?' })] }),
    draft: 'Your refund has been issued and should post in 3-5 business days.',
    expect: { severe: true, warnings: [/Says a refund was issued/] },
  },
  {
    name: 'refund proven by a staff internal note',
    kind: 'reply',
    context: draftContext({
      messages: [
        draftMessage({ direction: 'inbound', body: 'Can I get a refund?' }),
        draftMessage({ direction: 'internal', body: 'Refund has been issued in Seller Hub, full amount.' }),
      ],
    }),
    draft: 'Your refund has been issued for the full amount.',
    expect: { severe: false, clean: true },
  },
  {
    name: 'planned action stays planned (no claim)',
    kind: 'reply',
    context: draftContext({ messages: [draftMessage({ direction: 'inbound', body: 'Can I return it?' })] }),
    draft: 'Yes — once the return arrives and passes inspection, we will issue a refund.',
    expect: { severe: false },
  },
  {
    name: '"shipped" claimed while the order is not shipped',
    kind: 'reply',
    context: draftContext(),
    draft: 'Good news, your amplifier has shipped!',
    expect: { severe: true, warnings: [/Says the item shipped/] },
  },
  {
    name: '"shipped" proven by the order fulfillment',
    kind: 'reply',
    context: draftContext({ orders: [shippedOrder] }),
    draft: 'Your amplifier has shipped; tracking is 1Z999AA10123456784.',
    expect: { severe: false, clean: true },
  },
  {
    name: 'invented tracking number',
    kind: 'reply',
    context: draftContext(),
    draft: 'Here is your tracking number: 1Z12345E0205271688.',
    expect: { severe: true, warnings: [/no linked record contains/] },
  },
  {
    name: 'repair completed — proven by a Done repair',
    kind: 'reply',
    context: draftContext({ facts: [draftFact({ text: 'Repair RS-12: status Done.', proves: ['repaired'] })] }),
    draft: 'Your amplifier has been repaired and is ready to go back to you.',
    expect: { severe: false, clean: true },
  },
  {
    name: 'eBay: links, emails and phone numbers stripped before storing',
    kind: 'reply',
    context: draftContext(),
    draft: 'The manual is at https://example.com/amp.pdf — or email help@example.com or call (555) 123-4567.',
    expect: { severe: false, bodyExcludes: [/https?:/, /@example\.com/, /555/], warnings: [] },
  },
  {
    name: 'Amazon: held to the 4000-character limit',
    kind: 'reply',
    context: draftContext({ item: { channel: 'amazon' } }),
    draft: `Thanks for your patience. ${'It is in final testing. '.repeat(200)}`,
    expect: { severe: false, bodyIncludes: [/…$/] },
  },
  {
    name: 'asks for an order number the record already has',
    kind: 'reply',
    context: draftContext(),
    draft: 'Could you send us your order number so we can check on it?',
    expect: { severe: false, warnings: [/already linked/] },
  },
  {
    name: 'order question with no linked order → missing fact',
    kind: 'reply',
    context: draftContext({ orders: [], messages: [draftMessage({ direction: 'inbound', body: 'Where is my package?' })] }),
    draft: 'Could you share your order number so we can look it up?',
    expect: { severe: false, missingFacts: [/Order number/] },
  },
  {
    name: 'check-in claims delivery the record does not show',
    kind: 'check_in',
    context: checkInContext([draftOrder()]),
    draft: 'Hi Dana, your Studio Amplifier 200 (order 12-34567-89012) has been delivered — how is it working?',
    expect: { severe: true, warnings: [/Says the item was delivered/] },
  },
  {
    name: 'check-in with delivery on record is clean',
    kind: 'check_in',
    context: checkInContext(),
    draft: 'Hi Dana, we wanted to check in on your Studio Amplifier 200 from order 12-34567-89012 — how is everything working? Just reply here if you need anything.',
    expect: { severe: false, clean: true },
  },
  {
    name: 'live draft 5 (item 598): "follow up with the right size" is an unbacked send; asks for the bracket model the order line names',
    kind: 'reply',
    context: shortScrewContext(),
    draft:
      'We will check the correct screw length for the mounting kit and follow up with the right size. Please provide the bracket model or dimensions so we can verify the required length.',
    expect: {
      severe: false,
      warnings: [/Commits to "We will check the correct screw length .*follow up with the right size"/, /model \/ SKU.*UB-20/],
      confidence: 'medium',
    },
  },
  {
    name: '"send you the correct screw" / "get one out to you" / "ship you a replacement" are unbacked sends',
    kind: 'reply',
    context: shortScrewContext(),
    draft:
      'We will send you the correct screw. We can get a longer one out to you this week. We will ship you a replacement if that one is wrong too.',
    expect: {
      severe: false,
      warnings: [/Commits to "We will send you the correct screw"/, /Commits to "We can get a longer one out to you/, /Commits to "We will ship you a replacement/],
    },
  },
  {
    name: 'the same promise backed by a staff note is not flagged',
    kind: 'reply',
    context: shortScrewContext({
      messages: [
        draftMessage({ direction: 'inbound', body: 'One of the four screws is too short to reach the bracket. Can you send the right length?' }),
        draftMessage({ direction: 'internal', body: 'Send a longer UB-20 screw from the parts bin — Mike' }),
      ],
    }),
    draft: 'We will check the correct screw length for the UB-20 bracket and follow up with the right size.',
    expect: { severe: false, clean: true },
  },
  {
    name: 'near miss: following up after checking, and asking for a photo, promise nothing and ask nothing the order names',
    kind: 'reply',
    context: shortScrewContext(),
    draft:
      'We will follow up once we have checked the correct length for the UB-20 bracket. Could you send us a photo of the short screw next to the bracket?',
    expect: { severe: false, clean: true },
  },
  {
    name: 'live eval (not shipped, eBay): "scheduled to ship soon" and "allow us a day" with nothing on record',
    kind: 'reply',
    context: draftContext(),
    draft:
      'Your amplifier is currently scheduled to ship soon. We will check the shipping status and confirm the exact shipping date with our warehouse. Please allow us a day to verify and get back to you.',
    expect: {
      severe: true,
      warnings: [/ship\/delivery schedule.*scheduled to ship soon/, /States "a day"/],
      missingFacts: [/Ship \/ delivery timing/, /"a day"/],
      confidence: 'low',
    },
  },
  {
    name: 'time frames in words with no source: "by tomorrow", "a couple of days"',
    kind: 'reply',
    context: draftContext(),
    draft: 'We will have an update for you by tomorrow, or within a couple of days at the latest.',
    expect: { severe: true, warnings: [/"by tomorrow"/, /"a couple of days"/] },
  },
  {
    name: 'near miss: checking and getting back, "as soon as" a condition, "have a great day" — no schedule, no time frame',
    kind: 'reply',
    context: draftContext(),
    draft:
      'We will check the shipping status with our warehouse and get back to you. We will ship your order as soon as it passes testing. Have a great day!',
    expect: { severe: false, clean: true },
  },
  {
    name: 'a schedule a staff note states is sourced ("scheduled to ship by Monday")',
    kind: 'reply',
    context: testingNoteContext(),
    draft: 'It is in final testing and scheduled to ship by Monday.',
    expect: { severe: false, clean: true },
  },
  {
    name: '"should arrive soon" is backed by a shipped order',
    kind: 'reply',
    context: draftContext({ orders: [shippedOrder] }),
    draft: 'Your amplifier has shipped (tracking 1Z999AA10123456784) and should arrive soon.',
    expect: { severe: false, clean: true },
  },
];

export interface LiveDraftCase {
  name: string;
  kind: SupportDraftKind;
  context: SupportDraftContext;
  /** The draft must mention each (answers the actual question / names the facts). */
  mustMention: RegExp[];
  /** The draft must not say these (invented or forbidden content). */
  mustNotMention: RegExp[];
}

export const LIVE_CASES: LiveDraftCase[] = [
  {
    name: 'missing screws, size unknown (browser proof #1, item 595)',
    kind: 'reply',
    context: screwsContext(),
    mustMention: [/screw/i],
    mustNotMention: [
      /\d\s*[x\u00d7]\s*\d|\d\/\d+\s*(?:"|in)|\bM\d\b|#\d/i,
      /immediately/i,
      /contact us|reach out|get in touch/i,
      /when you(?:'re|\u2019re| are) ready/i,
      /\bapolog|\bsorry\b/i,
    ],
  },
  {
    name: 'when will it ship (not shipped yet, eBay)',
    kind: 'reply',
    context: draftContext({ messages: [draftMessage({ direction: 'inbound', body: 'Hi, when will my amplifier ship? I paid 3 days ago.' })] }),
    mustMention: [/ship/i],
    mustNotMention: [/https?:/i, /has shipped|is on its way|tracking number is/i],
  },
  {
    name: 'where is my package (shipped, tracking on record, email)',
    kind: 'reply',
    context: draftContext({
      item: { channel: 'email' },
      orders: [shippedOrder],
      messages: [draftMessage({ direction: 'inbound', body: 'Where is my package? I have not received anything.' })],
    }),
    mustMention: [/1Z999AA10123456784/],
    mustNotMention: [/has been delivered|was delivered/i],
  },
  {
    name: 'refund request with nothing refunded yet',
    kind: 'reply',
    context: draftContext({
      orders: [deliveredOrder],
      messages: [draftMessage({ direction: 'inbound', body: 'The amp hums loudly. I want a refund.' })],
    }),
    mustMention: [/refund|return/i],
    mustNotMention: [/refund (?:has been|was) (?:issued|processed)|we(?:'ve| have) (?:issued|processed)/i, /https?:/i],
  },
  {
    name: 'repair status (bench work on record)',
    kind: 'reply',
    context: draftContext({
      item: { channel: 'email' },
      facts: [
        draftFact({ text: 'Repair RS-12: Studio Amplifier 200, serial SN4411; status Pending Repair; reported issue "no sound on left channel"; received 2026-09-29.' }),
      ],
      messages: [draftMessage({ direction: 'inbound', body: 'Any update on my repair?' })],
    }),
    mustMention: [/repair|bench|technician|working/i],
    mustNotMention: [/has been (?:repaired|fixed)|repair is complete/i],
  },
  {
    name: 'post-purchase check-in (delivered)',
    kind: 'check_in',
    context: checkInContext(),
    mustMention: [/Dana/, /Studio Amplifier 200|amplifier/i, /12-34567-89012/],
    mustNotMention: [/refund|replacement|warranty claim/i],
  },
];
