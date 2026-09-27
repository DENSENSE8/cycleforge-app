/**
 * AnyChannelOrderChat goldens — an order sold on a marketplace, entered from
 * the chat with the same missing-fields loop as a phone order:
 *
 *  - any-order-*: eBay (USAV account) — order #, listing link and buyer, then
 *    ship-to + tracking completes it in 2 turns → Create → yes → the caged row
 *    exists under the account with the item number and the tracking linked.
 *  - any-listing-*: the same kind of order without a listing — the assistant
 *    asks for it; giving it completes the draft (nothing is created).
 *  - any-dup: the order number just created is surfaced as the existing order
 *    instead of a second draft to create; then everything is deleted.
 */

import { cleanupAnyOrder, latestDraftMissing, readAnyOrder } from './any-order-fixture';
import type { EvalFixtures } from './fixtures';
import type { Golden, TurnResult } from './goldens';

const calledWith = (r: TurnResult, name: string, arg?: string) =>
  r.tools.some((t) => t.name === name && (!arg || JSON.stringify(t.input ?? {}).toLowerCase().includes(arg.toLowerCase())));
const draftCard = (r: TurnResult) => r.artifacts.some((a) => a.producedBy === 'draft_manual_order' && a.kind === 'order_draft');

export function anyOrderGoldens(f: EvalFixtures, run: { startedAt: Date }): Golden[] {
  const t = run.startedAt.getTime();
  // A letters-only suffix: a model reads digits in a name as a phone number.
  const stamp = t.toString(26).replace(/[0-9a-p]/g, (ch) => 'abcdefghijklmnopqrstuvwxyz'[parseInt(ch, 26) % 26]).replace(/^./, (ch) => ch.toUpperCase());
  const digits = String(t).padStart(13, '0');
  // eBay 2-5-5 shape, unique per run; a listing id and a USPS-shaped tracking nobody has.
  const orderNo = `${digits.slice(-12, -10)}-${digits.slice(-10, -5)}-${digits.slice(-5)}`;
  const orderNo2 = `${digits.slice(-12, -10)}-${digits.slice(-10, -5)}-${String((Number(digits.slice(-5)) + 1) % 100000).padStart(5, '0')}`;
  const listing = `https://www.ebay.com/itm/9${digits.slice(-11)}`;
  const tracking = `9400${digits}00000`;
  const tracking2 = `9405${digits}00000`;
  const buyer = `Eval Buyer ${stamp}`;
  const buyer2 = `Eval Lister ${stamp}`;
  return [
    {
      id: 'any-order-draft',
      thread: 'any-order',
      question: `New eBay order on our USAV account: order # ${orderNo}, listing ${listing}, buyer ${buyer}.`,
      bins: [],
      check: async (r) => {
        const missing = (await latestDraftMissing(f.orgId, buyer)) ?? [];
        return [
          ['tool draft_manual_order (order #)', calledWith(r, 'draft_manual_order', orderNo)],
          ['order card', draftCard(r)],
          ['Still needed = ship-to + tracking only', missing.join('|') === 'Street address|City|State|ZIP|Tracking number, or buy a label'],
          ['asks for what is still needed', /(address|ship|tracking)/i.test(r.text)],
          ['nothing written yet', !calledWith(r, 'create_manual_order')],
        ];
      },
    },
    {
      id: 'any-order-fill',
      thread: 'any-order',
      question: `Ship to 1 Congress Ave, Austin TX 78701. Tracking is ${tracking}.`,
      bins: [],
      check: async (r) => [
        ['tool draft_manual_order (tracking)', calledWith(r, 'draft_manual_order', tracking)],
        ['order card', draftCard(r)],
        ['complete after 2 turns — nothing still needed', (await latestDraftMissing(f.orgId, buyer))?.length === 0],
      ],
    },
    { id: 'any-order-create', thread: 'any-order', question: 'Create this order', bins: [], check: (r) => [
      ['tool create_manual_order (propose)', calledWith(r, 'create_manual_order')],
      ['asks for a yes', /\byes\b/i.test(r.text)],
    ] },
    {
      id: 'any-order-confirm',
      thread: 'any-order',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const rows = await readAnyOrder(f.orgId, buyer);
        const row = rows[0];
        return [
          ['settled on the confirmation path', r.done?.mode === 'confirmation'],
          ['created card', r.artifacts.some((x) => x.producedBy === 'create_manual_order' && x.kind === 'order_draft')],
          ['one caged row under the eBay order #', rows.length === 1 && row.order_id === orderNo && row.release_state === 'caged'],
          ['channel = the USAV account', row?.account_source === 'USAV'],
          ['item number from the listing link', row?.item_number === listing.split('/itm/')[1]],
          ['tracking linked', row?.tracking === tracking],
        ];
      },
    },
    {
      id: 'any-listing-draft',
      thread: 'any-listing',
      question: `New eBay order on our USAV account: order # ${orderNo2}, buyer ${buyer2}. Ship to 9 Elm St, Dallas TX 75201. Tracking is ${tracking2}.`,
      bins: [],
      check: async (r) => {
        const missing = (await latestDraftMissing(f.orgId, buyer2)) ?? [];
        return [
          ['tool draft_manual_order', calledWith(r, 'draft_manual_order', orderNo2)],
          ['order card', draftCard(r)],
          ['Still needed = the listing only', missing.join('|') === 'Listing link or item number'],
          ['asks for the listing', /(listing|item number)/i.test(r.text)],
        ];
      },
    },
    {
      id: 'any-listing-fill',
      thread: 'any-listing',
      question: `The listing is https://www.ebay.com/itm/8${digits.slice(-11)}`,
      bins: [],
      check: async (r) => [
        ['tool draft_manual_order (listing)', calledWith(r, 'draft_manual_order', `8${digits.slice(-11)}`)],
        ['complete — nothing still needed', (await latestDraftMissing(f.orgId, buyer2))?.length === 0],
        ['nothing written', !calledWith(r, 'create_manual_order')],
      ],
    },
    {
      id: 'any-dup',
      thread: 'any-dup',
      question: `New eBay order on our USAV account: order # ${orderNo}, buyer ${buyer}.`,
      bins: [],
      check: async (r) => {
        const removed = await cleanupAnyOrder(f.orgId, buyer, tracking);
        await cleanupAnyOrder(f.orgId, buyer2, tracking2);
        return [
          ['tool draft_manual_order', calledWith(r, 'draft_manual_order', orderNo)],
          ['says it already exists', /already/i.test(r.text) && r.text.includes(orderNo)],
          ['no create proposed', !calledWith(r, 'create_manual_order')],
          ['cleanup removed the created order', removed === 1],
        ];
      },
    },
  ];
}
