import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ManualOrderRefused,
  createManualOrderInTx,
  createOrder,
  type CreateOrderDeps,
  type OrderCreatedEvent,
  type OrderTxClient,
} from './create-order';
import { emptyManualOrderDraft, type ManualOrderDraft } from './manual-order-draft';
import { parseOrderCreateBody } from '@/lib/schemas/order-create';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;
const OTHER_ORG = '99999999-8888-7777-6666-555555555555';

interface TxCall {
  text: string;
  params: unknown[];
}

/** A tenant transaction's client: records every statement, answers by statement shape. */
function fakeClient(opts: { customerUpdated?: boolean; taken?: string[]; nextSeq?: number; catalog?: Array<Record<string, unknown>> } = {}) {
  const calls: TxCall[] = [];
  let nextId = 500;
  const client = {
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      if (text.includes('INSERT INTO orders')) {
        return { rows: [{ id: nextId++, order_id: params[0], product_title: params[1], sku: params[2] }], rowCount: 1 };
      }
      if (text.includes('INSERT INTO customers')) return { rows: [{ id: 77 }], rowCount: 1 };
      if (text.includes('UPDATE customers')) return { rows: [], rowCount: opts.customerUpdated === false ? 0 : 1 };
      if (text.includes('SELECT id, order_id FROM orders')) {
        return { rows: (opts.taken ?? []).includes(String(params[1])) ? [{ id: 1, order_id: params[1] }] : [], rowCount: 0 };
      }
      if (text.includes('AS next')) return { rows: [{ next: opts.nextSeq ?? 1 }], rowCount: 1 };
      if (text.includes('FROM sku_catalog sc')) return { rows: opts.catalog ?? [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
  } as unknown as OrderTxClient;
  return { client, calls };
}

function fakes(opts: { duplicate?: boolean; customerUpdated?: boolean } = {}) {
  const tx = fakeClient({ customerUpdated: opts.customerUpdated });
  const cap = { preTx: [] as TxCall[], transactions: [] as string[], announced: [] as OrderCreatedEvent[] };
  const deps: CreateOrderDeps = {
    query: async (orgId, text, params) => {
      cap.preTx.push({ text, params: [orgId, ...params] });
      if (text.includes('FROM orders') && opts.duplicate) return { rows: [{ id: 9, order_id: params[1] }] };
      if (text.includes('FROM sku_catalog')) return { rows: [{ id: params[1], sku: `SKU-${params[1]}` }] };
      return { rows: [] };
    },
    transaction: async (orgId, fn) => {
      cap.transactions.push(orgId);
      return fn(tx.client);
    },
    planCeilingExceeded: async () => false,
    orgTypes: async () => [],
    resolveSkuCatalogId: async () => 42,
    registerShipment: async () => null,
    linkShipment: async () => null,
    afterCommit: async (event) => {
      cap.announced.push(event);
    },
  };
  return { deps, cap, tx };
}

const actor = { organizationId: ORG, staffId: 7, source: 'orders.add' };

function parse(body: Record<string, unknown>) {
  const parsed = parseOrderCreateBody(body);
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error);
  return parsed.input;
}

test('multi-line: every line lands under ONE order number in one transaction, lines 2+ get their own line id', async () => {
  const { deps, cap, tx } = fakes();
  const out = await createOrder(
    actor,
    parse({
      orderId: 'PH-000124',
      accountSource: 'Phone',
      lines: [
        { productTitle: 'Bose 151 pair', sku: '00005', skuCatalogId: 12, quantity: 2, saleAmount: 78 },
        { productTitle: 'UB-20 bracket', sku: '00960-Bk', skuCatalogId: 2429, quantity: 1, saleAmount: 25, condition: 'brand_new' },
      ],
      customer: { name: 'Jane Doe', phone: '555-201-8844', shipTo: { address1: '1 Main St', city: 'Chicago', state: 'IL', postalCode: '60614' } },
      shipBy: '2026-10-02',
    }),
    deps,
  );

  assert.equal(out.status, 200);
  assert.equal(cap.transactions.length, 1, 'customer + every line commit together');
  const inserts = tx.calls.filter((c) => c.text.includes('INSERT INTO orders'));
  assert.equal(inserts.length, 2);
  assert.deepEqual(inserts.map((c) => c.params[0]), ['PH-000124', 'PH-000124']);
  assert.deepEqual(inserts.map((c) => c.params[14]), ['', 'line-2'], 'external_line_id keeps the unique key distinct');
  assert.deepEqual(inserts.map((c) => c.params[8]), [ORG, ORG]);
  assert.deepEqual(inserts.map((c) => c.params[15]), [77, 77], 'both lines point at the new customer');
  assert.equal(inserts[1].params[10], 'BRAND_NEW', 'condition is normalized to the canonical grade');
  const deadlines = tx.calls.filter((c) => c.text.includes('INSERT INTO work_assignments')).map((c) => c.params[2]);
  assert.deepEqual(deadlines, ['2026-10-02', '2026-10-02']);
  assert.deepEqual(out.body.orderIds, [500, 501]);
  assert.equal(out.body.customerId, 77);
  assert.equal(cap.announced.length, 1);
  assert.deepEqual(cap.announced[0].orderPks, [500, 501]);
  assert.equal(cap.announced[0].customerCreated, true);
});

test('single-line form path: an existing order number is still a 409 and nothing is written', async () => {
  const { deps, cap } = fakes({ duplicate: true });
  const out = await createOrder(
    actor,
    parse({ orderId: '112-1234567-1234567', productTitle: 'Speaker', accountSource: 'amazon', quantity: '1' }),
    deps,
  );
  assert.equal(out.status, 409);
  assert.deepEqual(out.body, { error: 'Order with this order ID already exists', existingOrderId: '112-1234567-1234567' });
  assert.equal(cap.transactions.length, 0);
  assert.equal(cap.announced.length, 0);
  assert.equal(cap.preTx[0].params[0], ORG, 'the duplicate check is scoped to the caller org');
});

test('single-line form path: legacy body still creates ONE row with the historical response shape', async () => {
  const { deps, tx } = fakes();
  const out = await createOrder(
    actor,
    parse({ orderId: 'CF-1', productTitle: 'Speaker', accountSource: 'Manual', sku: 'S-1', quantity: '3', saleAmount: '12.5' }),
    deps,
  );
  assert.equal(out.status, 200);
  assert.equal(out.body.success, true);
  assert.equal(out.body.message, 'Order added successfully');
  const inserts = tx.calls.filter((c) => c.text.includes('INSERT INTO orders'));
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].params[5], 42, 'catalog id resolved the legacy way');
  assert.equal(inserts[0].params[6], 12.5);
  assert.equal(inserts[0].params[13], '3');
  assert.equal(inserts[0].params[14], '');
  assert.equal(inserts[0].params[15], null, 'no customer given, none written');
  assert.equal(tx.calls.some((c) => c.text.includes('customers')), false);
});

test('body validation keeps the historical sentences, in the historical order', () => {
  const err = (body: Record<string, unknown>) => {
    const parsed = parseOrderCreateBody(body);
    return parsed.ok ? null : parsed.error;
  };
  assert.equal(err({ orderId: 'X', accountSource: 'Manual' }), 'Missing required fields: orderId, productTitle, accountSource');
  assert.match(String(err({ orderId: 'X', productTitle: 'T', accountSource: 'M', condition: 'good', quantity: 0 })), /^condition must be one of: BRAND_NEW/);
  assert.equal(
    err({ orderId: 'X', productTitle: 'T', accountSource: 'M', saleAmount: 'abc', quantity: 0 }),
    'saleAmount must be a finite number when provided',
  );
  assert.equal(
    err({ orderId: 'X', productTitle: 'T', accountSource: 'M', quantity: 1.5 }),
    'quantity must be a whole number of at least 1 when provided',
  );
});

test('customer create is scoped to the caller org — an org in the body is never used', async () => {
  const { deps, tx } = fakes();
  await createOrder(
    actor,
    parse({
      orderId: 'PH-9',
      accountSource: 'Phone',
      organizationId: OTHER_ORG,
      lines: [{ productTitle: 'Speaker' }],
      customer: { name: 'Jane Doe', phone: '555-201-8844' },
    }),
    deps,
  );
  const insert = tx.calls.find((c) => c.text.includes('INSERT INTO customers'));
  assert.ok(insert);
  assert.equal(insert.params.at(-1), ORG);
  assert.equal(insert.params.includes(OTHER_ORG), false);
  assert.match(insert.text, /'customer'/);
});

test('an existing customer from another org is refused and no order row is written', async () => {
  const { deps, tx, cap } = fakes({ customerUpdated: false });
  const out = await createOrder(
    actor,
    parse({ orderId: 'PH-10', accountSource: 'Phone', lines: [{ productTitle: 'Speaker' }], customer: { id: 31 } }),
    deps,
  );
  assert.equal(out.status, 400);
  assert.equal(out.body.error, 'Customer not found');
  const update = tx.calls.find((c) => c.text.includes('UPDATE customers'));
  assert.ok(update);
  assert.match(update.text, /WHERE id = \$1 AND organization_id = \$2/);
  assert.deepEqual(update.params.slice(0, 2), [31, ORG]);
  assert.equal(tx.calls.some((c) => c.text.includes('INSERT INTO orders')), false);
  assert.equal(cap.announced.length, 0);
});

function phoneDraft(over: Partial<ManualOrderDraft> = {}): ManualOrderDraft {
  const d = emptyManualOrderDraft();
  return {
    ...d,
    orderNumber: 'PH-000124',
    orderNumberGenerated: true,
    customer: { ...d.customer, name: 'Jane Doe', phone: '555-201-8844' },
    lines: [
      { skuCatalogId: 12, sku: 'model-typed', title: 'model-typed title', quantity: 2, condition: null, unitPriceCents: 3900, itemNumber: '' },
    ],
    shipBy: '2026-10-02',
    parcel: { weightOz: 40, lengthIn: 12, widthIn: 10, heightIn: 8 },
    ...over,
  };
}

test('chat phone order: SKU and title come from THIS org\'s catalog, rows are caged with the parcel, money is the line total', async () => {
  const { client, calls } = fakeClient({
    catalog: [{ id: 12, sku: '00005', zoho_item_title: 'Bose 151 Environmental Speaker Pair', catalog_product_title: 'old title' }],
  });
  const created = await createManualOrderInTx(client, ORG, 7, phoneDraft(), async () => null);
  const insert = calls.find((c) => c.text.includes('INSERT INTO orders'));
  assert.ok(insert);
  assert.equal(insert.params[1], 'old title');
  assert.equal(insert.params[2], '00005');
  assert.equal(insert.params[6], 78, 'sale_amount = 2 × $39.00');
  assert.equal(insert.params[17], 'caged');
  assert.deepEqual(insert.params.slice(18, 22), [40, 12, 10, 8]);
  const catalogRead = calls.find((c) => c.text.includes('FROM sku_catalog sc'));
  assert.equal(catalogRead?.params[0], ORG);
  assert.equal(created.totalCents, 7800);
  assert.deepEqual(created.lines, [{ sku: '00005', title: 'old title', qty: 2, unitPriceCents: 3900 }]);
});

test('chat phone order: a generated number taken meanwhile is re-generated; a typed one is a 409', async () => {
  const catalog = [{ id: 12, sku: '00005', zoho_item_title: null, catalog_product_title: 'Bose 151' }];
  const generated = fakeClient({ taken: ['PH-000124'], nextSeq: 125, catalog });
  const out = await createManualOrderInTx(generated.client, ORG, 7, phoneDraft(), async () => null);
  assert.equal(out.orderNumber, 'PH-000125');

  const typed = fakeClient({ taken: ['PHONE-7'], catalog });
  await assert.rejects(
    createManualOrderInTx(typed.client, ORG, 7, phoneDraft({ orderNumber: 'PHONE-7', orderNumberGenerated: false }), async () => null),
    (err: unknown) => err instanceof ManualOrderRefused && err.status === 409,
  );
  assert.equal(typed.calls.some((c) => c.text.includes('INSERT INTO orders')), false);
});

test('chat phone order: a catalog id outside this org is refused before anything is inserted', async () => {
  const { client, calls } = fakeClient({ catalog: [] });
  await assert.rejects(
    createManualOrderInTx(client, ORG, 7, phoneDraft(), async () => null),
    (err: unknown) => err instanceof ManualOrderRefused && err.status === 404,
  );
  assert.equal(calls.some((c) => c.text.includes('INSERT INTO')), false);
});

function ebayDraft(over: Partial<ManualOrderDraft> = {}): ManualOrderDraft {
  const d = emptyManualOrderDraft();
  return {
    ...d,
    orderNumber: '12-34567-89012',
    orderNumberGenerated: false,
    channel: 'USAV',
    channelPlatform: 'ebay',
    channelLabel: 'eBay · USAV',
    customer: { ...d.customer, name: 'Pat Buyer', shipTo: { ...d.customer.shipTo, address1: '1 Main St', city: 'Austin', state: 'TX', postalCode: '78701' } },
    lines: [{ skuCatalogId: null, sku: '', title: 'Bose 151 pair (listing)', quantity: 1, condition: null, unitPriceCents: null, itemNumber: '397944288197' }],
    listingUrl: 'https://www.ebay.com/itm/397944288197',
    trackingNumber: '9400108106245603001206',
    ...over,
  };
}

test('chat marketplace order: an unpaired listing line is written with its item number, under the account, linked to the tracking shipment', async () => {
  const { client, calls } = fakeClient();
  const links: unknown[] = [];
  const out = await createManualOrderInTx(client, ORG, 7, ebayDraft(), async (_org, input) => links.push(input), [9001]);
  const insert = calls.find((c) => c.text.includes('INSERT INTO orders'));
  assert.ok(insert);
  assert.equal(insert.params[0], '12-34567-89012');
  assert.equal(insert.params[3], 'usav', 'account_source is the picked account, stored canonical');
  assert.equal(insert.params[9], 9001, 'shipment_id is the tracking shipment');
  assert.equal(insert.params[22], '397944288197', 'item_number');
  assert.equal(insert.params[5], null, 'no catalog id until paired');
  assert.equal(calls.some((c) => c.text.includes('FROM sku_catalog sc')), false, 'no catalog read without catalog lines');
  assert.equal(links.length, 1);
  assert.equal(out.orderNumber, '12-34567-89012');
});

test('chat marketplace order: a generated number or a line with neither catalog product nor item number is refused', async () => {
  const generated = fakeClient();
  await assert.rejects(
    createManualOrderInTx(generated.client, ORG, 7, ebayDraft({ orderNumber: 'US-000001', orderNumberGenerated: true }), async () => null),
    (err: unknown) => err instanceof ManualOrderRefused && err.status === 400,
  );
  const bare = fakeClient();
  await assert.rejects(
    createManualOrderInTx(bare.client, ORG, 7, ebayDraft({ lines: [{ ...ebayDraft().lines[0], itemNumber: '' }] }), async () => null),
    (err: unknown) => err instanceof ManualOrderRefused && err.status === 400,
  );
  assert.equal([...generated.calls, ...bare.calls].some((c) => c.text.includes('INSERT INTO')), false);
});

test('chat manual-channel order: a taken generated number is re-generated under THAT channel\'s prefix', async () => {
  const catalog = [{ id: 12, sku: '00005', zoho_item_title: null, catalog_product_title: 'Bose 151' }];
  const { client, calls } = fakeClient({ taken: ['WI-000003'], nextSeq: 4, catalog });
  const out = await createManualOrderInTx(
    client,
    ORG,
    7,
    phoneDraft({ channel: 'walk-in', channelPlatform: '', channelLabel: 'Walk-in', orderNumber: 'WI-000003' }),
    async () => null,
  );
  assert.equal(out.orderNumber, 'WI-000004');
  assert.equal(calls.find((c) => c.text.includes('AS next'))?.params[1], 'WI-');
});
