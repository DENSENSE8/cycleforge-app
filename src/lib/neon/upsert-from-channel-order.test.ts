/**
 * DB-free unit tests for upsertCustomerFromChannelOrder.
 *
 * The branch table (phone → email → create) is the whole contract, so every
 * arm is asserted on BOTH sides: the row that came back, and what was
 * actually threaded into the injected deps — because "did not clobber" and
 * "merged rather than replaced" are only visible in the second.
 *
 * Run: npx tsx --test src/lib/neon/upsert-from-channel-order.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import type { ChannelOrder } from '@/lib/ecwid/client';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  upsertCustomerFromChannelOrder,
  type ChannelCustomerRow,
  type UpsertCustomerFromChannelOrderDeps,
} from './upsert-from-channel-order';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

function order(overrides: Partial<ChannelOrder> = {}): ChannelOrder {
  return {
    provider: 'ecwid',
    id: 'A1B2C3',
    publicOrderNumber: '4787',
    createdAt: null,
    paymentStatus: 'PAID',
    fulfillmentStatus: 'SHIPPED',
    currency: 'USD',
    totalCents: 14998,
    refundedCents: 0,
    refunds: [],
    email: 'buyer@example.test',
    phone: '(555) 010-4477',
    billing: {
      name: 'Jane Buyer',
      email: 'buyer@example.test',
      phone: '(555) 010-4477',
      street: '12 Test Row',
      city: 'Springfield',
      stateOrProvince: 'Oregon',
      postalCode: '97403',
      countryCode: 'US',
    },
    shipping: null,
    items: [],
    ...overrides,
  };
}

interface Captured {
  phoneLookups: string[];
  emailLookups: string[];
  created: { name: string; phone: string; email: string }[];
  refsMerged: { customerId: number; refs: Record<string, string> }[];
  gapsFilled: { customerId: number; gaps: Record<string, string | undefined> }[];
}

function fakes(seed: { byPhone?: ChannelCustomerRow | null; byEmail?: ChannelCustomerRow | null } = {}) {
  const cap: Captured = {
    phoneLookups: [],
    emailLookups: [],
    created: [],
    refsMerged: [],
    gapsFilled: [],
  };
  const deps: UpsertCustomerFromChannelOrderDeps = {
    async findByPhoneDigits(_org, digits) {
      cap.phoneLookups.push(digits);
      return seed.byPhone ?? null;
    },
    async findByEmail(_org, email) {
      cap.emailLookups.push(email);
      return seed.byEmail ?? null;
    },
    async createCustomer(_org, args) {
      cap.created.push(args);
      return { id: 99, storedPhone: args.phone, storedName: args.name, storedEmail: args.email };
    },
    async mergeChannelRefs(_org, customerId, refs) {
      cap.refsMerged.push({ customerId, refs });
    },
    async fillContactGaps(_org, customerId, gaps) {
      cap.gapsFilled.push({ customerId, gaps });
    },
  };
  return { deps, cap };
}

test('matches on the identity phone before ever looking at email', async () => {
  const existing: ChannelCustomerRow = {
    id: 7,
    storedPhone: '555-010-4477',
    storedName: 'Jane B',
    storedEmail: 'old@example.test',
  };
  const { deps, cap } = fakes({ byPhone: existing });

  const result = await upsertCustomerFromChannelOrder(
    { orgId: ORG, order: order(), identityPhone: '(555) 010-4477' },
    deps,
  );

  assert.equal(result.matchedBy, 'phone');
  assert.equal(result.customer.id, 7);
  // Last-10 digits, formatting-insensitive — the counter's own rule, so a
  // walk-in and the online buyer land on ONE row.
  assert.deepEqual(cap.phoneLookups, ['5550104477']);
  // The email branch must not even run: a phone hit is the stronger key.
  assert.deepEqual(cap.emailLookups, []);
  assert.deepEqual(cap.created, []);
});

test('falls through to email when no phone matches', async () => {
  const existing: ChannelCustomerRow = {
    id: 12,
    storedPhone: '',
    storedName: 'Jane Buyer',
    storedEmail: 'buyer@example.test',
  };
  const { deps, cap } = fakes({ byPhone: null, byEmail: existing });

  const result = await upsertCustomerFromChannelOrder(
    { orgId: ORG, order: order(), identityPhone: '(555) 010-4477' },
    deps,
  );

  assert.equal(result.matchedBy, 'email');
  assert.equal(result.customer.id, 12);
  assert.deepEqual(cap.emailLookups, ['buyer@example.test']);
  assert.deepEqual(cap.created, []);
});

test('creates when neither key matches, using the identity phone not the order phone', async () => {
  const { deps, cap } = fakes();

  const result = await upsertCustomerFromChannelOrder(
    { orgId: ORG, order: order({ phone: '(555) 999-0000' }), identityPhone: '(555) 010-4477' },
    deps,
  );

  assert.equal(result.matchedBy, 'created');
  assert.equal(cap.created.length, 1);
  // The identity phone is the one the two-key check already agreed with; the
  // order's phone would land the visit on a different person than it bills.
  assert.equal(cap.created[0].phone, '(555) 010-4477');
  assert.equal(cap.created[0].name, 'Jane Buyer');
  assert.equal(cap.created[0].email, 'buyer@example.test');
});

test('a name typed at the counter beats the name on the order', async () => {
  const { deps, cap } = fakes();

  await upsertCustomerFromChannelOrder(
    { orgId: ORG, order: order(), identityPhone: '5550104477', typedName: 'Jane Q. Buyer' },
    deps,
  );

  assert.equal(cap.created[0].name, 'Jane Q. Buyer');
});

test('refuses to create a nameless customer', async () => {
  const { deps, cap } = fakes();

  await assert.rejects(
    () =>
      upsertCustomerFromChannelOrder(
        { orgId: ORG, order: order({ billing: null, shipping: null }), identityPhone: '5550104477' },
        deps,
      ),
    /no buyer name/i,
  );
  assert.deepEqual(cap.created, []);
});

test('merges the channel ref by internal id, never the public order number', async () => {
  const existing: ChannelCustomerRow = {
    id: 7,
    storedPhone: '5550104477',
    storedName: 'Jane B',
    storedEmail: 'jane@example.test',
  };
  const { deps, cap } = fakes({ byPhone: existing });

  await upsertCustomerFromChannelOrder(
    { orgId: ORG, order: order(), identityPhone: '5550104477' },
    deps,
  );

  assert.deepEqual(cap.refsMerged, [{ customerId: 7, refs: { ecwid: 'A1B2C3' } }]);
});

test('fills contact gaps on a matched row rather than replacing it', async () => {
  const existing: ChannelCustomerRow = {
    id: 7,
    storedPhone: '5550104477',
    storedName: 'Jane B',
    storedEmail: '',
  };
  const { deps, cap } = fakes({ byPhone: existing });

  const result = await upsertCustomerFromChannelOrder(
    { orgId: ORG, order: order(), identityPhone: '5550104477' },
    deps,
  );

  assert.equal(cap.gapsFilled.length, 1);
  assert.equal(cap.gapsFilled[0].customerId, 7);
  assert.equal(cap.gapsFilled[0].gaps.email, 'buyer@example.test');
  // The blank email is now filled in the returned row; the stored NAME is not
  // overwritten by the order's version of it.
  assert.equal(result.customer.storedEmail, 'buyer@example.test');
  assert.equal(result.customer.storedName, 'Jane B');
});

test('a failed channel_refs merge warns instead of failing the visit', async () => {
  const existing: ChannelCustomerRow = {
    id: 7,
    storedPhone: '5550104477',
    storedName: 'Jane B',
    storedEmail: 'jane@example.test',
  };
  const { deps } = fakes({ byPhone: existing });
  deps.mergeChannelRefs = async () => {
    throw new Error('vault down');
  };

  const result = await upsertCustomerFromChannelOrder(
    { orgId: ORG, order: order(), identityPhone: '5550104477' },
    deps,
  );

  assert.equal(result.customer.id, 7);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /could not be linked/i);
});

test('a too-short identity phone skips the phone branch entirely', async () => {
  const { deps, cap } = fakes({ byEmail: null });

  await upsertCustomerFromChannelOrder(
    { orgId: ORG, order: order(), identityPhone: '4477' },
    deps,
  );

  // A four-digit tail would match far too many rows to be an identity check.
  assert.deepEqual(cap.phoneLookups, []);
  assert.deepEqual(cap.emailLookups, ['buyer@example.test']);
  assert.equal(cap.created.length, 1);
});
