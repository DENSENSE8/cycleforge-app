import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buyerIdentityKey,
  resolveBuyerCustomers,
  type BuyerEntry,
  type ResolveBuyerCustomersDeps,
} from './resolve-buyer-customers';

/** DB-free unit tests for the buyer resolver's precedence + persistence (domain-unit-test pattern: */

const ORG = '00000000-0000-0000-0000-000000000002' as never;

interface Captured {
  queries: Array<{ sql: string; params: unknown[] }>;
  /** Rows to return per SELECT, keyed by the expression the query starts with. */
  selectRows: Record<string, Array<Record<string, unknown>>>;
}

function fakes(selectRows: Captured['selectRows'] = {}) {
  const cap: Captured = { queries: [], selectRows };
  const deps: ResolveBuyerCustomersDeps = {
    runQuery: async (_orgId, sql, params) => {
      cap.queries.push({ sql, params });
      for (const [marker, rows] of Object.entries(selectRows)) {
        if (sql.includes(marker)) return { rows: rows as never };
      }
      // An unmatched SELECT matches nothing; INSERT/UPDATE acks return the
      // canned new id.
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

test('buyerIdentityKey: channel id wins over email wins over phone', () => {
  assert.equal(buyerIdentityKey('shipstation', buyer()), 'id\u0000shipstation\u000037701499');
  assert.equal(
    buyerIdentityKey('shipstation', buyer({ channelCustomerId: '' })),
    'email\u0000buyer@example.com',
  );
  assert.equal(
    buyerIdentityKey('shipstation', buyer({ channelCustomerId: '', email: '' })),
    'phone\u00005555550199',
  );
  assert.equal(
    buyerIdentityKey('shipstation', buyer({ channelCustomerId: '', email: '', phone: '123' })),
    null,
    'no strong key → caller drops to the name tier',
  );
});

test('tier 1: an existing shipstation_customer_id match resolves and never inserts', async () => {
  const { deps, cap } = fakes({ 'shipstation_customer_id = ANY': [{ id: 42, channel_id: '37701499' }] });
  const out = await resolveBuyerCustomers(
    { orgId: ORG, buyers: [{ accountSource: 'shipstation', buyer: buyer() }] },
    deps,
  );
  assert.equal(out.get('id\u0000shipstation\u000037701499'), 42);
  const insert = cap.queries.find((q) => q.sql.startsWith('INSERT INTO customers'));
  assert.equal(insert, undefined, 'matched by channel id — nothing created');
  const update = cap.queries.find((q) => q.sql.startsWith('UPDATE customers'));
  assert.ok(update, 'matched row is refreshed');
  assert.ok(update!.sql.includes('shipstation_customer_id = COALESCE(shipstation_customer_id'), 'no id hijack — COALESCE guarded');
  assert.equal(update!.params[update!.params.length - 1], ORG, 'update is org-scoped');
});

test('tier 2: an email match adopts the row and stamps the channel id', async () => {
  const { deps, cap } = fakes({
    'lower(email) = ANY': [{ id: 7, email: 'buyer@example.com' }],
  });
  const out = await resolveBuyerCustomers(
    { orgId: ORG, buyers: [{ accountSource: 'shipstation', buyer: buyer() }] },
    deps,
  );
  assert.equal(out.get('id\u0000shipstation\u000037701499'), 7, 'keyed by the BUYER key, resolved to the adopted row');
  const update = cap.queries.find((q) => q.sql.startsWith('UPDATE customers'));
  assert.ok(update);
  const idIdx = update!.params.indexOf('37701499');
  assert.ok(idIdx > 0, 'channel id stamped onto the adopted row');
  assert.ok(update!.sql.includes('WHERE id = $1'), 'update targets the adopted row');
});

test('tier 3: a formatted phone matches on the last 10 digits', async () => {
  const { deps } = fakes({
    "regexp_replace(coalesce(mobile": [{ id: 9, phone10: '', mobile10: '5555550199' }],
  });
  const out = await resolveBuyerCustomers(
    {
      orgId: ORG,
      buyers: [{ accountSource: 'shipstation', buyer: buyer({ channelCustomerId: '', email: '' }) }],
    },
    deps,
  );
  assert.equal(out.get('phone\u00005555550199'), 9);
});

test('no match anywhere: creates the customer with the full buyer record', async () => {
  const { deps, cap } = fakes({});
  const out = await resolveBuyerCustomers(
    { orgId: ORG, buyers: [{ accountSource: 'shipstation', buyer: buyer() }] },
    deps,
  );
  assert.equal(out.get('id\u0000shipstation\u000037701499'), 901);
  const insert = cap.queries.find((q) => q.sql.startsWith('INSERT INTO customers'));
  assert.ok(insert, 'new buyer created');
  assert.ok(insert!.sql.includes('shipstation_customer_id'), 'channel id column stamped at birth');
  assert.equal(insert!.params[0], ORG, 'org scoped');
  assert.equal(insert!.params[1], 'Jane Doe', 'name → customer_name + display_name');
  assert.deepEqual(
    insert!.params.slice(6, 12),
    ['123 Main St', 'Suite 200', 'Austin', 'TX', '78701', 'US'],
    'full ship-to persisted',
  );
  assert.equal(JSON.parse(String(insert!.params[insert!.params.length - 1])).shipstation_customer_id, '37701499');
});

test('two orders from one buyer collapse to one resolution, one create', async () => {
  const { deps, cap } = fakes({});
  const out = await resolveBuyerCustomers(
    {
      orgId: ORG,
      buyers: [
        { accountSource: 'shipstation', buyer: buyer() },
        { accountSource: 'shipstation', buyer: buyer() },
      ],
    },
    deps,
  );
  assert.equal(out.size, 1);
  assert.equal(cap.queries.filter((q) => q.sql.startsWith('INSERT INTO customers')).length, 1);
});

test('a buyer with no strong key is left unresolved (name tier owns it)', async () => {
  const { deps, cap } = fakes({});
  const out = await resolveBuyerCustomers(
    {
      orgId: ORG,
      buyers: [{ accountSource: 'shipstation', buyer: buyer({ channelCustomerId: '', email: '', phone: '' }) }],
    },
    deps,
  );
  assert.equal(out.size, 0);
  assert.equal(cap.queries.length, 0, 'not even queried — no strong identity to match on');
});

test('a buyer with no channel id never touches the identity column', async () => {
  const { deps, cap } = fakes({});
  await resolveBuyerCustomers(
    {
      orgId: ORG,
      buyers: [{ accountSource: 'shipstation', buyer: buyer({ channelCustomerId: '' }) }],
    },
    deps,
  );
  const insert = cap.queries.find((q) => q.sql.startsWith('INSERT INTO customers'));
  assert.ok(insert);
  assert.ok(!insert!.sql.includes('shipstation_customer_id,'), 'no id to stamp — plain insert');
});
