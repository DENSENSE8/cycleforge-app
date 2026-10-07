import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOrderBuyers,
  type BuyerEntry,
  type OrderBuyerRequest,
  type ResolveBuyerCustomersDeps,
} from './resolve-buyer-customers';

/** DB-free unit tests for the one order-buyer resolver's precedence + persistence (domain-unit-test pattern). */

const ORG = '00000000-0000-0000-0000-000000000002' as never;

interface Captured {
  queries: Array<{ sql: string; params: unknown[] }>;
}

/** `selectRows`: rows to return for the first query whose SQL contains the marker. */
function fakes(selectRows: Record<string, Array<Record<string, unknown>>> = {}) {
  const cap: Captured = { queries: [] };
  const deps: ResolveBuyerCustomersDeps = {
    runQuery: async (_orgId, sql, params) => {
      cap.queries.push({ sql, params });
      for (const [marker, rows] of Object.entries(selectRows)) {
        if (sql.includes(marker)) return { rows: rows as never };
      }
      // An unmatched SELECT matches nothing; INSERT/UPDATE acks return the canned new id.
      if (/^\s*SELECT/i.test(sql)) return { rows: [] as never };
      return { rows: [{ id: 901 }] as never };
    },
  };
  return { deps, cap };
}

const buyer = (over: Partial<BuyerEntry['buyer']> = {}): BuyerEntry['buyer'] => ({
  channelCustomerId: '37701499',
  name: 'Jane Doe',
  email: 'buyer@example.com',
  phone: '+1 555-555-0199',
  shipTo: {
    address1: '123 Main St',
    address2: 'Suite 200',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
    residential: true,
  },
  ...over,
});

const req = (over: Partial<OrderBuyerRequest> = {}): OrderBuyerRequest => ({
  accountSource: 'shipstation',
  orderNumber: '114-0000000-0000001',
  buyer: buyer(),
  name: '',
  ...over,
});

const inserts = (cap: Captured) => cap.queries.filter((q) => q.sql.trimStart().startsWith('INSERT INTO customers'));

test('channel id: an existing shipstation_customer_id match resolves, is refreshed, never inserts', async () => {
  const { deps, cap } = fakes({ 'shipstation_customer_id = ANY': [{ id: 42, channel_id: '37701499' }] });
  const [out] = await resolveOrderBuyers(ORG, [req()], deps);
  assert.deepEqual(out, { customerId: 42, created: false });
  assert.equal(inserts(cap).length, 0);
  const update = cap.queries.find((q) => q.sql.startsWith('UPDATE customers'));
  assert.ok(update!.sql.includes('shipstation_customer_id = COALESCE(shipstation_customer_id'), 'no id hijack — COALESCE guarded');
  assert.equal(update!.params[update!.params.length - 1], ORG, 'update is org-scoped');
});

test('email: a match adopts the row and stamps the channel id', async () => {
  const { deps, cap } = fakes({ 'lower(email) = ANY': [{ id: 7, email: 'buyer@example.com' }] });
  const [out] = await resolveOrderBuyers(ORG, [req()], deps);
  assert.deepEqual(out, { customerId: 7, created: false });
  const update = cap.queries.find((q) => q.sql.startsWith('UPDATE customers'));
  assert.ok(update!.params.indexOf('37701499') > 0, 'channel id stamped onto the adopted row');
});

test('phone: a formatted phone matches on the last 10 digits', async () => {
  const { deps } = fakes({ 'regexp_replace(coalesce(mobile': [{ id: 9, phone10: '', mobile10: '5555550199' }] });
  const [out] = await resolveOrderBuyers(ORG, [req({ buyer: buyer({ channelCustomerId: '', email: '' }) })], deps);
  assert.equal(out.customerId, 9);
});

test('strong identity with no match creates the customer with the full buyer record', async () => {
  const { deps, cap } = fakes({});
  const [out] = await resolveOrderBuyers(ORG, [req()], deps);
  assert.deepEqual(out, { customerId: 901, created: true });
  const [insert] = inserts(cap);
  assert.ok(insert.sql.includes('shipstation_customer_id'), 'channel id column stamped at birth');
  assert.deepEqual(insert.params.slice(6, 12), ['123 Main St', 'Suite 200', 'Austin', 'TX', '78701', 'US']);
  assert.equal(cap.queries.some((q) => q.sql.includes('order_id = ANY')), false, 'a strong identity never falls to the order-number tier');
});

test('two orders from one buyer resolve to one customer with one create', async () => {
  const { deps, cap } = fakes({});
  const out = await resolveOrderBuyers(ORG, [req(), req({ orderNumber: '114-0000000-0000002' })], deps);
  assert.deepEqual(out.map((o) => o.customerId), [901, 901]);
  assert.equal(inserts(cap).length, 1);
});

test('no strong identity: the customer already created for this order number wins over the name', async () => {
  const { deps, cap } = fakes({ 'order_id = ANY': [{ id: 55, order_id: 'S-1' }] });
  const [out] = await resolveOrderBuyers(ORG, [req({ orderNumber: 'S-1', buyer: null, name: 'Jane Doe' })], deps);
  assert.deepEqual(out, { customerId: 55, created: false });
  assert.equal(cap.queries.some((q) => q.sql.includes('display_name')), false, 'name tier not reached');
});

test('name: a bare name joins the existing customer; an unknown name is created once, stamped with the order number', async () => {
  const { deps, cap } = fakes({
    'AS match_key\n       FROM customers': [{ id: 3, match_key: 'jane doe' }],
    'RETURNING id': [{ id: 77, match_key: 'sam roe' }],
  });
  const out = await resolveOrderBuyers(
    ORG,
    [
      req({ orderNumber: 'S-1', buyer: null, name: ' Jane  DOE ' }),
      req({ orderNumber: 'S-2', buyer: null, name: 'Sam Roe' }),
      req({ orderNumber: 'S-3', buyer: null, name: 'sam roe' }),
    ],
    deps,
  );
  assert.deepEqual(out, [
    { customerId: 3, created: false },
    { customerId: 77, created: true },
    { customerId: 77, created: true },
  ]);
  const [insert] = inserts(cap);
  assert.equal(inserts(cap).length, 1, 'one customer per name');
  assert.ok(insert.params.includes('S-2'), 'customers.order_id carries the first order number');
});

test('a contact with no email/phone but a ship-to is created with that ship-to, not as a bare name', async () => {
  const { deps, cap } = fakes({});
  const [out] = await resolveOrderBuyers(ORG, [req({ buyer: buyer({ channelCustomerId: '', email: '', phone: '' }) })], deps);
  assert.deepEqual(out, { customerId: 901, created: true });
  const [insert] = inserts(cap);
  assert.ok(insert.params.includes('123 Main St'));
});

test('no buyer evidence resolves to null without a query', async () => {
  const { deps, cap } = fakes({});
  const [out] = await resolveOrderBuyers(ORG, [req({ orderNumber: '', buyer: null, name: '  ' })], deps);
  assert.deepEqual(out, { customerId: null, created: false });
  assert.equal(cap.queries.length, 0);
});
