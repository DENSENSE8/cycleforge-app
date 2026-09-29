import test from 'node:test';
import assert from 'node:assert/strict';
import { getNavLocate, type NavLocateDeps, type NavLocateResult } from './service';
import { buildOutboundRefsSql, buildOutboundTextCountSql } from './outbound';
import { NAV_LOCATE_MAX_REFS, NavLocateResponseSchema, type NavLocateResponse } from '@/lib/nav/context/schema';
import { buildPackerLogBaseWhere, sqlPackerLogSearch } from '@/lib/neon/packer-logs-week';
import { sqlDeskQueueScope } from '@/lib/orders/desk-view-sql';
import { sqlOrderInExceptionQueue } from '@/lib/orders/exception-membership';
import { exceptionScopeWhere, exceptionSearchSql } from '@/lib/orders/order-exceptions';
import type { OrdersListQuery } from '@/lib/orders/orders-list-query';
import { DESK_VIEW_ORDER, deskViewHref } from '@/lib/outbound/desk-views';
import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';
import { readShippedDateWindow } from '@/lib/shipping/shipped-filter/shipped-filter-params';
import type { CheckZohoReceivedLocal, CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const EVERY = new Set(['orders.view', 'packing.view', 'receiving.view']);

/** Order rows the refs statement returns per pasted ref (its membership flags). */
const ORDERS: Record<string, Array<Record<string, unknown>>> = {
  '02-15212-00001': [
    { id: 11, order_id: '02-15212-00001', product_title: 'Bose QC45', in_triage: true, in_pick: true },
  ],
  '1Z999AA10123456784': [{ id: 12, order_id: '113-0000000-0000001', product_title: null, in_shipped: true }],
  'SPLIT-9': [
    { id: 13, order_id: 'SPLIT-9', product_title: 'Speaker', in_exceptions: true },
    { id: 14, order_id: 'SPLIT-9', product_title: 'Remote', in_po: true },
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
    verdict: 'settled' as CheckZohoReceivedRow['verdict'],
    ...patch,
  };
}

/** The Check's answer per pasted inbound number. */
const CHECK: Record<string, CheckZohoReceivedRow> = {
  'PO-1': checkRow('PO-1', { po_number: 'PO-1', vendor_name: 'Acme', local: { ...LOCAL, unboxed: true } }),
  'PO-2': checkRow('PO-2', { po_number: 'PO-2', vendor_name: 'Acme' }),
  'PO-3': checkRow('PO-3', { po_number: 'PO-3', status: 'received', verdict: 'erp_ahead' }),
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
      if (view) return [{ n: { triage: 4, pick: 2, po: 1 }[view] }];
      return [{ exceptions: 3, shipped: 5 }];
    },
    ordersListSql: async (orgId, query) => {
      cap.lists.push(query);
      const view = query.poPaired ? 'po' : query.pickQueue ? 'pick' : 'triage';
      return { sql: `LIST:${view}`, params: [orgId, query.query] };
    },
    inboundCheck: async (_orgId, refs) => {
      cap.checked.push([...refs]);
      return refs.flatMap((ref) => (CHECK[ref] ? [CHECK[ref]] : []));
    },
    inboundLines: async () => LINES,
  };
  return { deps, cap };
}

async function ok(result: NavLocateResult): Promise<NavLocateResponse> {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  return NavLocateResponseSchema.parse(result.body);
}

const counts = (body: NavLocateResponse) => Object.fromEntries(body.buckets.map((b) => [b.id, b.count]));

test('outbound text: one bucket per desk view in DESK_VIEW_ORDER, each counted by its own list', async () => {
  const { deps, cap } = fakes();
  const body = await ok(await getNavLocate({ orgId: ORG, permissions: EVERY }, 'outbound', { q: '02-15212' }, deps));
  assert.deepEqual(body.buckets.map((b) => b.id), [...DESK_VIEW_ORDER]);
  assert.deepEqual(body.buckets.map((b) => b.href), [
    ...DESK_VIEW_ORDER.filter((id) => id !== 'shipped').map((id) => deskViewHref(id)),
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
  assert.deepEqual(body.buckets.map((b) => b.label), ['Exceptions', 'PO paired', 'Pick list', 'Allocate', 'Shipped']);
  assert.deepEqual(counts(body), { exceptions: 3, po: 1, pick: 2, triage: 4, shipped: 5 });
  assert.deepEqual(body.entries, []);
  assert.equal(body.truncated, 0);
  // Each queue view ran the desk's own scoped search — never the unscoped feed.
  assert.equal(cap.lists.length, 3);
  for (const list of cap.lists) {
    assert.equal(list.query, '02-15212');
    assert.equal(list.inWarehouse, true);
    assert.equal(list.includeShipped, false);
  }
  assert.deepEqual(cap.lists.map((l) => [l.pickQueue, l.poPaired, l.blockedOnly]), [
    [false, true, true],
    [true, false, false],
    [false, false, false],
  ]);
  assert.ok(cap.statements.every((s) => s.orgId === ORG));
});

test('outbound without packing.view omits the Shipped bucket, not the answer', async () => {
  const { deps, cap } = fakes();
  const caller = { orgId: ORG, permissions: new Set(['orders.view']) };
  const text = await ok(await getNavLocate(caller, 'outbound', { q: 'bose' }, deps));
  assert.deepEqual(text.buckets.map((b) => b.id), ['exceptions', 'po', 'pick', 'triage']);
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
  assert.deepEqual(everywhere.buckets.map((b) => b.id), ['inbound:received', 'inbound:not_received', 'inbound:exceptions']);
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
    ['SPLIT-9', ['exceptions', 'po']],
    ['NOPE123', []],
    ['02-15212-00001', ['pick', 'triage']],
    ['1Z999AA10123456784', ['shipped']],
  ]);
  assert.deepEqual(counts(body), { exceptions: 1, po: 1, pick: 1, triage: 1, shipped: 1 });
  const [split, nope, single, shipped] = body.entries;
  // Two order lines are no single record.
  assert.deepEqual([split.title, split.detail, split.recordHref], ['SPLIT-9 · Speaker', '2 order lines', null]);
  assert.deepEqual([nope.title, nope.detail, nope.recordHref], [null, null, null]);
  assert.equal(single.title, '02-15212-00001 · Bose QC45');
  assert.ok(single.recordHref?.startsWith('/'));
  assert.equal(shipped.title, '113-0000000-0000001');
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

test('inbound: the Check verdict per ref — received, not received, exceptions (status kept), nowhere', async () => {
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
    ['received', null],
    ['not_received', null],
    ['exceptions', '/incoming?lane=exceptions'],
  ]);
  assert.deepEqual(body.entries.map((e) => [e.ref, e.buckets]), [
    ['PO-1', ['received']],
    ['PO-2', ['not_received']],
    ['PO-3', ['not_received', 'exceptions']],
    // A badge with nothing in the Exceptions view stays owed, reason in detail.
    ['PO-4', ['not_received']],
    ['NOPE', []],
    ['MANUAL-7', ['received']],
  ]);
  assert.deepEqual(counts(body), { received: 2, not_received: 3, exceptions: 1 });
  assert.equal(body.entries[0].title, 'PO PO-1 · Acme');
  assert.equal(body.entries[3].detail, 'Several POs match');
  assert.equal(body.entries[4].detail, null);
  assert.deepEqual(cap.checked, [['PO-1', 'PO-2', 'PO-3', 'PO-4', 'NOPE', 'MANUAL-7']]);

  const text = await ok(await getNavLocate({ orgId: ORG, permissions: EVERY }, 'inbound', { q: 'PO-3' }, deps));
  assert.deepEqual(counts(text), { received: 0, not_received: 1, exceptions: 1 });
  assert.deepEqual(text.entries, []);
});

test('everywhere: every permitted locator, ids and labels prefixed, entries merged per ref', async () => {
  const { deps } = fakes();
  const body = await ok(
    await getNavLocate({ orgId: ORG, permissions: EVERY }, 'everywhere', { refs: '02-15212-00001,PO-1,ZZZ' }, deps),
  );
  assert.deepEqual(body.locator, 'everywhere');
  assert.deepEqual(body.buckets.map((b) => b.id), [
    ...DESK_VIEW_ORDER.map((id) => `outbound:${id}`),
    'inbound:received',
    'inbound:not_received',
    'inbound:exceptions',
  ]);
  assert.equal(body.buckets.find((b) => b.id === 'outbound:triage')?.label, 'Fulfillment · Allocate');
  assert.equal(body.buckets.find((b) => b.id === 'inbound:received')?.label, 'Receiving · Received');
  assert.deepEqual(body.entries.map((e) => [e.ref, e.buckets, e.title]), [
    ['02-15212-00001', ['outbound:pick', 'outbound:triage'], '02-15212-00001 · Bose QC45'],
    ['PO-1', ['inbound:received'], 'PO PO-1 · Acme'],
    ['ZZZ', [], null],
  ]);
});

test('the outbound statements read each view list\'s own membership predicates', () => {
  const refs = buildOutboundRefsSql(ORG, ['02-15212-00001'], true);
  for (const predicate of [
    sqlDeskQueueScope('triage'),
    sqlDeskQueueScope('pick'),
    sqlDeskQueueScope('po'),
    sqlOrderInExceptionQueue('o', 'stn'),
    ...buildPackerLogBaseWhere({ organizationId: ORG }, []).conditions.slice(1),
  ]) {
    assert.ok(refs.sql.includes(predicate), `refs statement lacks ${predicate.slice(0, 60)}`);
  }
  assert.equal(buildOutboundRefsSql(ORG, ['x'], false).sql.includes('packer_logs pl'), false);

  const text = buildOutboundTextCountSql(ORG, 'Bose', true);
  assert.ok(text.sql.includes(exceptionScopeWhere('actionable')));
  assert.ok(text.sql.includes(exceptionSearchSql('$2')));
  assert.equal(text.params[1], '%bose%');
  const likeIndex = text.params.indexOf('%Bose%');
  assert.ok(likeIndex > 0);
  assert.ok(text.sql.includes(sqlPackerLogSearch(`$${likeIndex + 1}`)));
});
