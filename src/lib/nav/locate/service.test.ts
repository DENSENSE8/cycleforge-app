import test from 'node:test';
import assert from 'node:assert/strict';
import { getNavLocate, type NavLocateDeps, type NavLocateResult } from './service';
import { buildOutboundRefsSql, buildOutboundTextCountSql } from './outbound';
import { NAV_LOCATE_MAX_REFS, NavLocateResponseSchema, type NavLocateResponse } from '@/lib/nav/context/schema';
import { SHIP_OUT_LATERAL } from '@/lib/neon/orders-queries';
import { ORDER_STAGE_FACTS_JOIN } from '@/lib/orders/order-stage-facts';
import { WA_DEADLINE_LATERAL } from '@/lib/orders/orders-list';
import { buildPackerLogBaseWhere, sqlPackerLogSearch } from '@/lib/neon/packer-logs-week';
import { sqlDeskQueueScope } from '@/lib/orders/desk-view-sql';
import type { OrdersListQuery } from '@/lib/orders/orders-list-query';
import { DESK_VIEW_ORDER, deskViewHref } from '@/lib/outbound/desk-views';
import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';
import { readShippedDateWindow } from '@/lib/shipping/shipped-filter/shipped-filter-params';
import type { CheckZohoReceivedLocal, CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  identifierEqualsQuery,
  identifierFaceCompact,
  sqlIdentifierEqualsQuery,
  sqlIdentifierFaceCompact,
} from '@/lib/search/order-number-match';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const EVERY = new Set(['orders.view', 'packing.view', 'receiving.view']);
const OUTBOUND_LOCATOR_VIEWS = DESK_VIEW_ORDER.filter((id) => id !== 'exceptions');

/** Order rows the refs statement returns per pasted ref (its membership flags). */
const ORDERS: Record<string, Array<Record<string, unknown>>> = {
  '02-15212-00001': [
    {
      id: 11,
      order_id: '02-15212-00001',
      product_title: 'Bose QC45',
      in_triage: true,
      // The row facts the same statement reads (WA_DEADLINE_LATERAL, ORDER_STAGE_FACTS_JOIN, SHIP_OUT_LATERAL).
      status: 'unshipped',
      ship_by_date: '2026-10-06',
      fact_title: 'Bose QuietComfort 45',
      sku: 'QC45-BLK',
      tracking_number: '1ZA677K10318827054',
      delivered_at: null,
      picked_at: new Date('2026-10-04T15:00:00Z'),
      picked_by: 7,
      picked_by_name: ' Kai ',
      picked_source: 'picking_session',
      packed_at: new Date('2026-10-04T17:00:00Z'),
      packer_id: 4,
      packer_name: 'Tuan',
      shipped_at: null,
    },
  ],
  '1Z999AA10123456784': [{ id: 12, order_id: '113-0000000-0000001', product_title: null, in_shipped: true }],
  'SPLIT-9': [
    { id: 13, order_id: 'SPLIT-9', product_title: 'Speaker', in_exceptions: true },
    { id: 14, order_id: 'SPLIT-9', product_title: 'Remote', in_triage: true },
  ],
};

const LOCAL: CheckZohoReceivedLocal = {
  known: true,
  delivered: false,
  delivered_at: null,
  scanned: false,
  unboxed: false,
  watch: null as unknown as CheckZohoReceivedLocal['watch'],
};

function checkRow(tracking: string, patch: Partial<CheckZohoReceivedRow>): CheckZohoReceivedRow {
  return {
    tracking,
    po_number: null,
    reference_number: null,
    vendor_name: null,
    status: 'open',
    reason: 'matched',
    source: 'mirror',
    synced_at: null,
    local: LOCAL,
    ...patch,
  };
}

/** The Check's answer per pasted inbound number. */
const CHECK: Record<string, CheckZohoReceivedRow> = {
  'PO-1': checkRow('PO-1', { po_number: 'PO-1', vendor_name: 'Acme', local: { ...LOCAL, unboxed: true } }),
  'PO-2': checkRow('PO-2', { po_number: 'PO-2', vendor_name: 'Acme' }),
  // Zoho says received, nothing scanned: the carrier fact decides (in transit), never a Zoho label.
  'PO-3': checkRow('PO-3', { po_number: 'PO-3', status: 'received' }),
  'PO-4': checkRow('PO-4', { reason: 'ambiguous', local: { ...LOCAL, known: false } }),
  NOPE: checkRow('NOPE', { reason: 'no_match', status: null, local: { ...LOCAL, known: false } }),
  'MANUAL-7': checkRow('MANUAL-7', { reason: 'no_match', status: null, local: { ...LOCAL, known: false } }),
};

/** A warehouse-only receipt the Check never saw — `view=reconcile` has its line. */
const LINES = [
  { tracking_number: 'MANUAL-7', unboxed_at: '2026-09-20T10:00:00Z', quantity_received: 1 } as unknown as ReceivingLineRow,
];

interface Captured {
  lists: OrdersListQuery[];
  statements: Array<{ orgId: OrgId; sql: string; params: readonly unknown[] }>;
  checked: string[][];
}

function fakes() {
  const cap: Captured = { lists: [], statements: [], checked: [] };
  const deps: NavLocateDeps = {
    run: async (orgId, sql, params) => {
      cap.statements.push({ orgId, sql, params });
      if (sql.includes('WITH r AS')) {
        const refs = params[1] as string[];
        return refs.flatMap((ref, index) => (ORDERS[ref] ?? []).map((row) => ({ ...row, ord: index + 1 })));
      }
      const view = /FROM \(LIST:(\w+)\) listed/.exec(sql)?.[1];
      if (view) return [{ n: { triage: 4 }[view] }];
      return [{ unused: 0, shipped: 5 }];
    },
    ordersListSql: async (orgId, query) => {
      cap.lists.push(query);
      return { sql: 'LIST:triage', params: [orgId, query.query] };
    },
    inboundCheck: async (_orgId, refs) => {
      cap.checked.push([...refs]);
      return refs.flatMap((ref) => (CHECK[ref] ? [CHECK[ref]] : []));
    },
    inboundLines: async () => LINES,
    inboundAwaiting: async () => [],
    inboundFollowups: async () => [],
    supportRows: async () => {
      throw new Error('support is asked on /support only');
    },
  };
  return { deps, cap };
}

async function ok(result: NavLocateResult): Promise<NavLocateResponse> {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  return NavLocateResponseSchema.parse(result.body);
}

const counts = (body: NavLocateResponse) => Object.fromEntries(body.buckets.map((b) => [b.id, b.count]));

test('outbound text: FBM locator omits Exceptions because they only live globally', async () => {
  const { deps, cap } = fakes();
  const body = await ok(await getNavLocate({ orgId: ORG, permissions: EVERY }, 'outbound', { q: '02-15212' }, deps));
  assert.deepEqual(body.buckets.map((b) => b.id), OUTBOUND_LOCATOR_VIEWS);
  assert.deepEqual(body.buckets.map((b) => b.href), [
    ...OUTBOUND_LOCATOR_VIEWS.filter((id) => id !== 'shipped').map((id) => deskViewHref(id)),
    `${deskViewHref('shipped')}&allDates=1`,
  ]);
  // Every href survives its route's hygiene, and Shipped opens on the window its count reads (none).
  for (const bucket of body.buckets) {
    const url = new URL(bucket.href ?? '', 'http://t');
    const spec = routeParamsFor(url.pathname);
    assert.ok(spec, url.pathname);
    assert.deepEqual([...parseRouteParams(spec, url.searchParams)], [...url.searchParams], `${bucket.href} is rewritten`);
  }
  const shippedUrl = new URL(body.buckets.find((b) => b.id === 'shipped')?.href ?? '', 'http://t');
  assert.deepEqual(readShippedDateWindow(shippedUrl.searchParams), { start: '', end: '' });
  assert.deepEqual(body.buckets.map((b) => b.label), ['Allocate', 'Fulfilled']);
  assert.deepEqual(counts(body), { triage: 4, shipped: 5 });
  assert.deepEqual(body.entries, []);
  assert.equal(body.truncated, 0);
  // Each queue view ran the desk's own scoped search — never the unscoped feed.
  assert.equal(cap.lists.length, 1);
  for (const list of cap.lists) {
    assert.equal(list.query, '02-15212');
    assert.equal(list.inWarehouse, true);
    assert.equal(list.includeShipped, false);
  }
  assert.deepEqual(cap.lists.map((l) => [l.poPaired, l.blockedOnly]), [[false, false]]);
  assert.ok(cap.statements.every((s) => s.orgId === ORG));
});

test('outbound without packing.view omits the Shipped bucket, not the answer', async () => {
  const { deps, cap } = fakes();
  const caller = { orgId: ORG, permissions: new Set(['orders.view']) };
  const text = await ok(await getNavLocate(caller, 'outbound', { q: 'bose' }, deps));
  assert.deepEqual(text.buckets.map((b) => b.id), ['triage']);
  assert.ok(cap.statements.every((s) => !s.sql.includes('packer_logs pl')), 'shipped never queried');
  const pasted = await ok(await getNavLocate(caller, 'outbound', { refs: '1Z999AA10123456784' }, deps));
  // Its only home is Shipped, which this caller cannot see.
  assert.deepEqual(pasted.entries[0].buckets, []);
});

test('outbound needs orders.view; everywhere skips it silently', async () => {
  const { deps, cap } = fakes();
  const caller = { orgId: ORG, permissions: new Set(['packing.view', 'receiving.view']) };
  assert.deepEqual(await getNavLocate(caller, 'outbound', { q: 'bose' }, deps), {
    ok: false,
    status: 403,
    error: 'FORBIDDEN',
    permission: 'orders.view',
  });
  assert.deepEqual(await getNavLocate(caller, 'inbound', { q: 'PO-1' }, deps).then((r) => r.ok), true);
  const everywhere = await ok(await getNavLocate(caller, 'everywhere', { refs: 'PO-1' }, deps));
  assert.deepEqual(everywhere.buckets.map((b) => b.id), ['inbound:awaiting_tracking', 'inbound:received', 'inbound:not_received', 'inbound:exceptions']);
  assert.ok(cap.statements.length === 0, 'no outbound statement ran');
  const denied = await getNavLocate({ orgId: ORG, permissions: new Set(['orders.view']) }, 'inbound', { q: 'x' }, deps);
  assert.equal(denied.ok ? null : denied.permission, 'receiving.view');
});

test('outbound refs: one entry per ref in paste order, [] when found nowhere, counts = refs per bucket', async () => {
  const { deps } = fakes();
  const body = await ok(
    await getNavLocate(
      { orgId: ORG, permissions: EVERY },
      'outbound',
      { refs: 'SPLIT-9\nNOPE123, 02-15212-00001;1Z999AA10123456784' },
      deps,
    ),
  );
  assert.deepEqual(body.entries.map((e) => [e.ref, e.buckets]), [
    ['SPLIT-9', ['triage']],
    ['NOPE123', []],
    ['02-15212-00001', ['triage']],
    ['1Z999AA10123456784', ['shipped']],
  ]);
  assert.deepEqual(counts(body), { triage: 2, shipped: 1 });
  const [split, nope, single, shipped] = body.entries;
  // Two order lines are no single record.
  assert.deepEqual([split.title, split.detail, split.recordHref], ['SPLIT-9 · Speaker', '2 order lines', null]);
  assert.deepEqual([nope.title, nope.detail, nope.recordHref, nope.facts], [null, null, null, null]);
  assert.equal(single.title, '02-15212-00001 · Bose QC45');
  assert.ok(single.recordHref?.startsWith('/'));
  assert.equal(shipped.title, '113-0000000-0000001');
  // The order's row facts, read in the same statement: ship-by, picker with its resolver source, packer by staff id, packed stamp.
  assert.deepEqual(single.facts, {
    section: 'outbound',
    title: 'Bose QuietComfort 45',
    sku: 'QC45-BLK',
    tracking: '1ZA677K10318827054',
    deliveredAt: null,
    channelStatus: 'unshipped',
    shipBy: '2026-10-06',
    pickedAt: '2026-10-04T15:00:00.000Z',
    pickedBy: { id: 7, name: 'Kai', source: 'picking_session' },
    packedAt: '2026-10-04T17:00:00.000Z',
    shippedAt: null,
    packer: { id: 4, name: 'Tuan' },
    po: null,
    vendor: null,
    lines: 1,
    duplicates: [],
    unboxedAt: null,
    unboxedBy: null,
    units: null,
  });
  // A ref naming several order lines reads its lead line, and says how many.
  assert.deepEqual([split.facts?.section, split.facts?.lines, split.facts?.packer], ['outbound', 2, null]);
});

test('outbound refs: the facts ride the ONE refs statement, off the To-ship list joins', async () => {
  const { deps, cap } = fakes();
  await ok(await getNavLocate({ orgId: ORG, permissions: EVERY }, 'outbound', { refs: '02-15212-00001' }, deps));
  assert.equal(cap.statements.length, 1, 'no second read for the facts');
  const [{ sql }] = cap.statements;
  for (const fragment of [WA_DEADLINE_LATERAL, ORDER_STAGE_FACTS_JOIN, SHIP_OUT_LATERAL]) {
    assert.ok(sql.includes(fragment), `refs statement lacks ${fragment.trim().slice(0, 50)}`);
  }
});

test('outbound channelStatus is the source\'s word, never the warehouse stage — the bucket is', async () => {
  // Regression (2026-10-04): 1909809 / 9235459 / 9247429 — Amazon imports landed
  // `orders.status = 'shipped'` with tracking, never packed or scanned out here.
  const { deps } = fakes();
  const run = deps.run;
  deps.run = async (orgId, sql, params) =>
    sql.includes('WITH r AS')
      ? [{ ord: 1, id: 13527, order_id: '113-6729910-1909809', product_title: 'Bracket', in_triage: true, status: 'shipped', tracking_number: '9300110990513574820788', packed_at: null, shipped_at: null, packer_id: null, packer_name: null }]
      : run(orgId, sql, params);
  const body = await ok(await getNavLocate({ orgId: ORG, permissions: EVERY }, 'outbound', { refs: '1909809' }, deps));
  const [entry] = body.entries;
  assert.deepEqual(entry.buckets, ['triage']);
  assert.deepEqual(
    [entry.facts?.channelStatus, entry.facts?.shippedAt, entry.facts?.packedAt, entry.facts?.packer],
    ['shipped', null, null, null],
  );
  assert.equal('orderStatus' in (entry.facts ?? {}), false);
});

test('refs past the cap are dropped and reported; duplicates collapse', async () => {
  const { deps, cap } = fakes();
  const pasted = Array.from({ length: NAV_LOCATE_MAX_REFS + 5 }, (_, i) => `REF${1000 + i}`);
  const body = await ok(
    await getNavLocate({ orgId: ORG, permissions: EVERY }, 'outbound', { refs: [...pasted, 'ref1000'].join(',') }, deps),
  );
  assert.equal(body.entries.length, NAV_LOCATE_MAX_REFS);
  assert.equal(body.truncated, 5);
  assert.deepEqual(body.entries.map((e) => e.ref), pasted.slice(0, NAV_LOCATE_MAX_REFS));
  assert.deepEqual(cap.statements[0].params[1], pasted.slice(0, NAV_LOCATE_MAX_REFS));
});

test('blank lines and repeats never count against the cap', async () => {
  const { deps } = fakes();
  const unique = Array.from({ length: NAV_LOCATE_MAX_REFS }, (_, i) => `07-15050-${String(10000 + i)}`);
  // The operator's paste: every number twice, dashed and not, blank lines between.
  const paste = unique.flatMap((ref) => [ref, '', ref.replace(/-/g, ''), '  ']).join('\n');
  const body = await ok(await getNavLocate({ orgId: ORG, permissions: EVERY }, 'outbound', { refs: paste }, deps));
  assert.equal(body.truncated, 0);
  assert.deepEqual(body.entries.map((e) => e.ref), unique);
});

test('outbound: the number an order row shows (its id chip face) finds that order', () => {
  // Regression (2026-10-04): 1909809 · 9235459 · 9247429, copied off /shipping/orders,
  // all answered "Not found" — the faces of 113-6729910-1909809 etc. The identifier
  // arm matched only the whole id or its last 8, never the 7-digit face.
  const built = buildOutboundRefsSql(ORG, ['1909809', '9235459', '9247429'], true);
  assert.ok(built.sql.includes(sqlIdentifierEqualsQuery('o.order_id', 'c.ref')));
  assert.ok(built.sql.includes(sqlIdentifierFaceCompact('o.order_id')), 'the chip-face arm decides');
  // The candidate key the order is probed by is the face's tail, so the face reaches the predicate.
  const key4 = built.params[6] as string[];
  assert.deepEqual(key4, ['9809', '5459', '7429']);
  assert.equal(identifierFaceCompact('113-6729910-1909809').slice(-4), key4[0]);
  assert.equal(identifierEqualsQuery('113-6729910-1909809', '1909809'), true);
  assert.equal(identifierEqualsQuery('112-4410844-9235459', '9235459'), true);
  assert.equal(identifierEqualsQuery('114-7232334-9247429', '9247429'), true);
});

test('a section never says "Not found" for a ref another readable section holds', async () => {
  const { deps, cap } = fakes();
  const body = await ok(
    await getNavLocate({ orgId: ORG, permissions: EVERY }, 'outbound', { refs: '02-15212-00001,PO-1,ZZZ' }, deps),
  );
  assert.equal(body.locator, 'outbound');
  // The page's own buckets first, unprefixed and complete; another section's only where it holds a ref.
  assert.deepEqual(body.buckets.map((b) => [b.id, b.count]), [
    ...OUTBOUND_LOCATOR_VIEWS.map((id) => [id, id === 'triage' ? 1 : 0]),
    ['inbound:received', 1],
  ]);
  const received = body.buckets.find((b) => b.id === 'inbound:received');
  // The id carries the section; the painted label is the bare status (owner 2026-10-04).
  assert.equal(received?.label, 'Received');
  assert.equal(received?.href, '/incoming?recon=received');
  assert.deepEqual(body.entries.map((e) => [e.ref, e.buckets, e.title]), [
    ['02-15212-00001', ['triage'], '02-15212-00001 · Bose QC45'],
    ['PO-1', ['inbound:received'], 'PO PO-1 · Acme'],
    // In neither section: still found nowhere.
    ['ZZZ', [], null],
  ]);
  // Only the refs the page did not hold were asked of Receiving.
  assert.deepEqual(cap.checked, [['PO-1', 'ZZZ']]);

  // Without the other section's permission the answer stays the page's own.
  const ordersOnly = await ok(
    await getNavLocate({ orgId: ORG, permissions: new Set(['orders.view']) }, 'outbound', { refs: 'PO-1' }, deps),
  );
  assert.deepEqual(ordersOnly.entries[0].buckets, []);
  assert.ok(ordersOnly.buckets.every((b) => !b.id.includes(':')));
});

test('inbound: the Check answer per ref — received, not received, nowhere', async () => {
  const { deps, cap } = fakes();
  const body = await ok(
    await getNavLocate(
      { orgId: ORG, permissions: EVERY },
      'inbound',
      { refs: 'PO-1,PO-2,PO-3,PO-4,NOPE,MANUAL-7' },
      deps,
    ),
  );
  assert.deepEqual(body.buckets.map((b) => [b.id, b.href]), [
    ['awaiting_tracking', '/incoming?state=AWAITING_TRACKING'],
    ['received', '/incoming?recon=received'],
    ['not_received', '/incoming?recon=not_received'],
    ['exceptions', '/incoming?lane=exceptions'],
  ]);
  // A number with no carton line opens its Incoming card all the same — the card's placeholder row
  // (`pastedNumberPlaceholderId`) on a list of just that number; one found nowhere has no record.
  assert.deepEqual(
    body.entries.map((e) => e.recordHref?.replace(/openLine=-\d+$/, 'openLine=<placeholder>') ?? null),
    [
      '/incoming?ref_in=PO-1&openLine=<placeholder>',
      '/incoming?ref_in=PO-2&openLine=<placeholder>',
      '/incoming?ref_in=PO-3&openLine=<placeholder>',
      '/incoming?ref_in=PO-4&openLine=<placeholder>',
      null,
      '/incoming?ref_in=MANUAL-7&openLine=<placeholder>',
    ],
  );
  assert.deepEqual(body.entries.map((e) => [e.ref, e.buckets]), [
    ['PO-1', ['received']],
    ['PO-2', ['not_received']],
    ['PO-3', ['not_received']],
    // A badge with nothing in the Exceptions view stays owed, reason in detail.
    ['PO-4', ['not_received']],
    ['NOPE', []],
    ['MANUAL-7', ['received']],
  ]);
  assert.deepEqual(counts(body), { awaiting_tracking: 0, received: 2, not_received: 3, exceptions: 0 });
  assert.equal(body.entries[0].title, 'PO PO-1 · Acme');
  assert.equal(body.entries[3].detail, 'Several POs match');
  assert.equal(body.entries[4].detail, null);
  assert.deepEqual(cap.checked, [['PO-1', 'PO-2', 'PO-3', 'PO-4', 'NOPE', 'MANUAL-7']]);

  const text = await ok(await getNavLocate({ orgId: ORG, permissions: EVERY }, 'inbound', { q: 'PO-3' }, deps));
  assert.deepEqual(counts(text), { awaiting_tracking: 0, received: 0, not_received: 1, exceptions: 0 });
  assert.equal(body.entries[2].detail, 'In transit');
  assert.deepEqual(text.entries, []);
});

test('awaiting tracking is the Incoming list, not the in_transit facet', async () => {
  const { deps } = fakes();
  deps.inboundAwaiting = async () => [{ zoho_purchaseorder_number: 'PO-2' } as ReceivingLineRow];
  const body = await ok(
    await getNavLocate({ orgId: ORG, permissions: EVERY }, 'inbound', { refs: 'PO-1,PO-2,PO-3' }, deps),
  );
  const po2 = body.entries.find((entry) => entry.ref === 'PO-2');
  assert.deepEqual(po2?.buckets, ['awaiting_tracking', 'not_received']);
  assert.equal(body.buckets.find((bucket) => bucket.id === 'awaiting_tracking')?.count, 1);
  assert.ok(!body.entries.find((entry) => entry.ref === 'PO-3')?.buckets.includes('awaiting_tracking'));
});

test("inbound detail says the carrier's last word and the number's follow-up tag, keyed by its PO", async () => {
  const { deps } = fakes();
  deps.inboundLines = async () => [
    ...LINES,
    { zoho_purchaseorder_number: 'PO-2', tracking_number: '1ZA677K10318827054', shipment_estimated_delivery_at: '2026-10-05' } as unknown as ReceivingLineRow,
  ];
  const asked: string[][] = [];
  deps.inboundFollowups = async (_orgId, keys) => {
    asked.push([...keys]);
    return [{ key: 'PO2', tag: 'need_claim', note: null, setBy: 1, setByName: 'Ana', setAt: '2026-10-03T18:00:00Z' }];
  };
  const body = await ok(await getNavLocate({ orgId: ORG, permissions: EVERY }, 'inbound', { refs: 'PO-1,PO-2' }, deps));
  assert.deepEqual(asked, [['PO1', 'PO2']]);
  assert.equal(body.entries[1].detail, 'In transit · ETA Oct 5 · Need claim');
  assert.equal(body.entries[0].detail, 'Unboxed');

  // The typed field answers buckets only — it never reads tags.
  asked.length = 0;
  await ok(await getNavLocate({ orgId: ORG, permissions: EVERY }, 'inbound', { q: 'PO-2' }, deps));
  assert.deepEqual(asked, []);
});

test('inbound facts: the pasted page row off the reconcile lines — unboxer by staff id, carton record', async () => {
  const { deps } = fakes();
  const line = (patch: Partial<ReceivingLineRow>) =>
    // The feed's own stamp shapes: a stringified `Date` (delivered) and Postgres `timestamptz::text` (unboxed).
    ({ zoho_purchaseorder_number: 'PO-1', tracking_number: '1ZA677K10318827054', is_delivered: true, delivered_at: String(new Date('2026-09-18T20:00:00Z')), ...patch }) as unknown as ReceivingLineRow;
  deps.inboundLines = async () => [
    line({
      id: 1,
      receiving_id: 501,
      catalog_product_title: 'Bose SoundLink Mini',
      sku: 'SLM-1',
      vendor_name: 'Goodwill',
      quantity_received: 1,
      quantity_expected: 2,
      unboxed_at: '2026-09-19 03:00:00.123456-07',
      unboxed_by_name: 'Dana',
      unboxed_by_id: 7,
    }),
    // A later unbox that never stamped its completer: the staffer who opened the carton.
    line({
      id: 2,
      receiving_id: 502,
      quantity_received: 1,
      quantity_expected: 1,
      unboxed_at: '2026-09-20 03:00:00.5-07',
      unbox_opened_by_name: 'Lin',
      unbox_opened_by_id: 9,
    }),
  ];
  const body = await ok(await getNavLocate({ orgId: ORG, permissions: EVERY }, 'inbound', { refs: 'PO-1,NOPE' }, deps));
  const [po1, nope] = body.entries;
  assert.deepEqual(po1.facts, {
    section: 'inbound',
    title: 'Bose SoundLink Mini',
    sku: 'SLM-1',
    tracking: '1ZA677K10318827054',
    // Every stamp an ISO-8601 UTC instant, whatever shape the feed handed over.
    deliveredAt: '2026-09-18T20:00:00.000Z',
    channelStatus: null,
    shipBy: null,
    pickedAt: null,
    pickedBy: null,
    packedAt: null,
    shippedAt: null,
    packer: null,
    po: 'PO-1',
    vendor: 'Goodwill',
    lines: 2,
    duplicates: [],
    unboxedAt: '2026-09-20T10:00:00.500Z',
    unboxedBy: { id: 9, name: 'Lin' },
    units: { received: 2, expected: 3 },
  });
  // Its record opens the way its Incoming card does — never a scan station.
  assert.equal(po1.recordHref, '/incoming?ref_in=PO-1&openLine=1');
  assert.equal(nope.facts, null);
  assert.equal(nope.recordHref, null);

  // Under `everywhere` (and any fall-through) the facts merge with the entry.
  const merged = await ok(await getNavLocate({ orgId: ORG, permissions: EVERY }, 'everywhere', { refs: '02-15212-00001,PO-1' }, deps));
  assert.deepEqual(merged.entries.map((e) => [e.ref, e.facts?.section, e.recordHref]), [
    ['02-15212-00001', 'outbound', '/shipping/orders?openOrderId=11'],
    ['PO-1', 'inbound', '/incoming?ref_in=PO-1&openLine=1'],
  ]);
  assert.deepEqual(merged.entries[1].facts?.unboxedBy, { id: 9, name: 'Lin' });
});

test('everywhere: every permitted locator, ids and labels prefixed, entries merged per ref', async () => {
  const { deps } = fakes();
  const body = await ok(
    await getNavLocate({ orgId: ORG, permissions: EVERY }, 'everywhere', { refs: '02-15212-00001,PO-1,ZZZ' }, deps),
  );
  assert.deepEqual(body.locator, 'everywhere');
  assert.deepEqual(body.buckets.map((b) => b.id), [
    ...OUTBOUND_LOCATOR_VIEWS.map((id) => `outbound:${id}`),
    'inbound:awaiting_tracking',
    'inbound:received',
    'inbound:not_received',
    'inbound:exceptions',
  ]);
  assert.equal(body.buckets.find((b) => b.id === 'outbound:triage')?.label, 'Allocate');
  assert.equal(body.buckets.find((b) => b.id === 'inbound:received')?.label, 'Received');
  assert.deepEqual(body.entries.map((e) => [e.ref, e.buckets, e.title]), [
    ['02-15212-00001', ['outbound:triage'], '02-15212-00001 · Bose QC45'],
    ['PO-1', ['inbound:received'], 'PO PO-1 · Acme'],
    ['ZZZ', [], null],
  ]);
});

test('the outbound statements read visible FBM and Fulfilled membership only', () => {
  const refs = buildOutboundRefsSql(ORG, ['02-15212-00001'], true);
  for (const predicate of [
    sqlDeskQueueScope('triage'),
    ...buildPackerLogBaseWhere({ organizationId: ORG }, []).conditions.slice(1),
  ]) {
    assert.ok(refs.sql.includes(predicate), `refs statement lacks ${predicate.slice(0, 60)}`);
  }
  assert.equal(buildOutboundRefsSql(ORG, ['x'], false).sql.includes('packer_logs pl'), false);

  const text = buildOutboundTextCountSql(ORG, 'Bose', true);
  assert.doesNotMatch(text.sql, /exception/i);
  const likeIndex = text.params.indexOf('%Bose%');
  assert.ok(likeIndex > 0);
  assert.ok(text.sql.includes(sqlPackerLogSearch(`$${likeIndex + 1}`)));
});
