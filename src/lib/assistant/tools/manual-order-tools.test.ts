/**
 * DB-free tests for the any-channel order draft: the channel picked from the
 * org's own accounts, the listing link → item-number line, the per-channel
 * "Still needed" list, and the duplicate order surfaced instead of a copy.
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/assistant/tools/manual-order-tools.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artifactOrderDraftSchema, type ArtifactOrderDraft } from '@/lib/assistant/ui-artifacts';
import { draftManualOrder, matchChannel, nameAsSaid, type ChannelChoice } from './manual-order-tools';
import type { AssistantToolCtx, AssistantToolDeps } from './types';

const ORG = '11111111-2222-3333-4444-555555555555';
const ctx: AssistantToolCtx = { organizationId: ORG, staffId: 7, permissions: new Set(['orders.view']), sessionId: null };

const PLATFORMS = [
  { id: 1, slug: 'ebay', label: 'eBay', is_active: true },
  { id: 2, slug: 'walmart', label: 'Walmart', is_active: true },
];
const ACCOUNTS = [
  { id: 10, platform_id: 1, slug: 'USAV', label: 'USAV', is_active: true },
  { id: 11, platform_id: 1, slug: 'MEKONG', label: 'MEKONG', is_active: true },
];

function harness(opts: { existingOrder?: string; existingTracking?: string; listing?: Record<string, unknown> } = {}) {
  const calls: Array<{ orgId: string; text: string; params: ReadonlyArray<unknown> }> = [];
  const deps = {
    query: async (orgId: string, text: string, params: ReadonlyArray<unknown> = []) => {
      calls.push({ orgId, text, params });
      if (text.includes('FROM platforms')) return { rows: PLATFORMS };
      if (text.includes('FROM platform_accounts')) return { rows: ACCOUNTS };
      if (text.includes('FROM integration_store_links')) return { rows: [{ platform_account_id: 10 }, { platform_account_id: 11 }] };
      if (text.includes('FROM sku_platform_ids')) return { rows: opts.listing ? [opts.listing] : [] };
      if (text.includes('order_id = ANY')) {
        const forms = params[1] as string[];
        return { rows: opts.existingOrder && forms.includes(opts.existingOrder) ? [{ id: 4242, order_id: opts.existingOrder }] : [] };
      }
      if (text.includes('shipping_tracking_numbers')) {
        return { rows: opts.existingTracking && params[1] === opts.existingTracking ? [{ id: 4343, order_id: '26-15154-57991' }] : [] };
      }
      return { rows: [] };
    },
  } as unknown as AssistantToolDeps;
  return { deps, calls };
}

async function draft(input: Record<string, unknown>, h = harness(), userMessage = ''): Promise<{ card: ArtifactOrderDraft; summary: string }> {
  const out = (await draftManualOrder.run(draftManualOrder.inputSchema.parse(input), { ...ctx, userMessage }, h.deps)) as { artifact: unknown; summary: string };
  return { card: artifactOrderDraftSchema.parse(out.artifact), summary: out.summary };
}

const choices: ChannelChoice[] = [
  { value: 'Phone', label: 'Phone', platform: '' },
  { value: 'USAV', label: 'eBay · USAV', platform: 'ebay' },
  { value: 'MEKONG', label: 'eBay · MEKONG', platform: 'ebay' },
  { value: 'walmart', label: 'Walmart', platform: 'walmart' },
];

test('a said channel resolves to the one account it names; a bare platform names all its accounts', () => {
  assert.deepEqual(matchChannel('our eBay USAV store', choices).map((c) => c.value), ['USAV']);
  assert.deepEqual(matchChannel('Walmart', choices).map((c) => c.value), ['walmart']);
  assert.deepEqual(matchChannel('ebay', choices).map((c) => c.value), ['USAV', 'MEKONG']);
  assert.deepEqual(matchChannel('Etsy', choices), []);
});

test('eBay order from a listing link: account, item-number line, marketplace number — still needs ship-to and tracking, never price or phone', async () => {
  const h = harness({ listing: { listing_title: 'Bose 151 pair', id: null } });
  const { card, summary } = await draft(
    { channel: 'eBay USAV', orderNumber: '12-34567-89012', listingUrl: 'https://www.ebay.com/itm/Bose-151/397944288197?hash=x', customerName: 'Pat Buyer' },
    h,
  );
  assert.equal(card.draft.channel, 'USAV');
  assert.equal(card.draft.channelPlatform, 'ebay');
  assert.equal(card.draft.orderNumber, '12-34567-89012');
  assert.equal(card.draft.orderNumberGenerated, false);
  assert.equal(card.draft.lines.length, 1);
  assert.equal(card.draft.lines[0].itemNumber, '397944288197');
  assert.equal(card.draft.lines[0].title, 'Bose 151 pair');
  assert.deepEqual(card.missing, ['Street address', 'City', 'State', 'ZIP', 'Tracking number, or buy a label']);
  assert.match(summary, /Still needed/);
  assert.ok(h.calls.every((c) => c.orgId === ORG && c.params[0] === ORG), 'every read is scoped to the caller org');
});

test('the same eBay order without a listing: the listing is the one thing still asked for beyond ship-to', async () => {
  const { card } = await draft({
    channel: 'eBay USAV',
    orderNumber: '12-34567-89012',
    customerName: 'Pat Buyer',
    address1: '1 Main St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    trackingNumber: '9400108106245603001206',
  });
  assert.deepEqual(card.missing, ['Listing link or item number']);
});

test('a bare "eBay" leaves the account to pick — the card offers the accounts, not a guess', async () => {
  const { card } = await draft({ channel: 'ebay', orderNumber: '12-34567-89012' });
  assert.equal(card.draft.channel, '');
  assert.deepEqual(card.channelChoices.map((c) => c.value), ['USAV', 'MEKONG']);
  assert.match(card.missing[0], /^Which account: eBay · USAV, eBay · MEKONG$/);
  assert.equal(card.missing.includes('Sales channel'), false);
});

test('an order number the org already has is surfaced as that order, and nothing asks to create it', async () => {
  const { card, summary } = await draft(
    { channel: 'eBay USAV', orderNumber: '#12-34567-89012', customerName: 'Pat Buyer' },
    harness({ existingOrder: '12-34567-89012' }),
  );
  assert.deepEqual(card.duplicate, { orderPk: 4242, orderNumber: '12-34567-89012', matchedOn: 'order number' });
  assert.match(summary, /DUPLICATE/);
  assert.match(summary, /triage=4242/);
  assert.doesNotMatch(summary, /Still needed/);
});

test('a tracking number already on an order is a duplicate too', async () => {
  const { card } = await draft(
    { channel: 'Walmart', orderNumber: 'WM-555', trackingNumber: '9434 6502 0621 7291 0980 04' },
    harness({ existingTracking: '9434650206217291098004' }),
  );
  assert.equal(card.duplicate?.matchedOn, 'tracking');
  assert.equal(card.duplicate?.orderPk, 4343);
});

test('phone order keeps its own needs: phone number and price, a generated PH- number', async () => {
  const { card } = await draft({ customerName: 'Jane Doe' });
  assert.equal(card.draft.channel, 'Phone');
  assert.equal(card.draft.orderNumberGenerated, true);
  assert.match(card.draft.orderNumber, /^PH-\d{6}$/);
  assert.ok(card.missing.includes('Phone number'));
  assert.ok(card.missing.includes('A product'));
  assert.equal(card.missing.some((m) => /Tracking|Listing|Marketplace/.test(m)), false);
});

test('identifiers the model leaves out are taken from the message itself', async () => {
  const msg = 'New eBay order on our USAV account: order # 12-34567-89012, buyer Pat. Listing https://www.ebay.com/itm/397944288197. Tracking is 9400 1081 0624 5603 0012 06.';
  const { card } = await draft({ channel: 'eBay USAV', customerName: 'Pat' }, harness(), msg);
  assert.equal(card.draft.orderNumber, '12-34567-89012');
  assert.equal(card.draft.lines[0]?.itemNumber, '397944288197');
  assert.equal(card.draft.trackingNumber, '9400 1081 0624 5603 0012 06');
});

test('the customer name is the one typed, even when the model passes only part of it', async () => {
  const msg = 'Phone order: Eval Caller mukeblst, 555-845-9805, ship to 42 Wallaby Way. She wants 2 of SKU 00066-P-2.';
  assert.equal((await draft({ customerName: 'mukeblst' }, harness(), msg)).card.draft.customer.name, 'Eval Caller mukeblst');
  assert.equal(nameAsSaid('Jane', 'New phone order for Jane Doe, 555-123-4567'), 'Jane Doe');
  // A label word is not part of the name; a name the message lacks is kept as passed.
  assert.equal(nameAsSaid('Jane Doe', 'Customer Jane Doe called, wants two'), 'Jane Doe');
  assert.equal(nameAsSaid('Zed', 'no name here'), 'Zed');
});
