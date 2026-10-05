import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { OrgId } from '@/lib/tenancy/constants';
import { SUPPORT_WORK_FLAGS, type SupportWorkFlags } from '@/lib/support/conversation/model';
import { SUPPORT_LIST_VIEWS, cutSupportList, parseSupportListFilter, type SupportListRow } from '@/lib/support/list/support-list';
import { NAV_FACET_CONTEXTS, NAV_FACET_GROUPS } from './contexts';
import { getNavFacets, type NavFacetsDeps } from './service';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const NO_FLAGS = Object.fromEntries(SUPPORT_WORK_FLAGS.map((f) => [f, false])) as SupportWorkFlags;

function row(itemId: number, over: Partial<SupportListRow> = {}): SupportListRow {
  return {
    itemId,
    taskId: itemId + 1000,
    kind: 'conversation',
    purpose: 'customer_conversation',
    lifecycle: 'open',
    status: 'open',
    flags: NO_FLAGS,
    subject: `Item ${itemId}`,
    transport: 'email',
    externalTicketId: null,
    platform: null,
    account: null,
    contact: { label: null, detail: null, email: null, relay: null },
    primaryOrder: null,
    assignees: [],
    pendingInboundCount: 0,
    lastInboundAt: null,
    lastOutboundAt: null,
    lastActivityAt: '2026-10-04T10:00:00.000Z',
    nextFollowUpAt: null,
    deadlineAt: null,
    urgent: false,
    resolvedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    checkInState: null,
    ...over,
  };
}

const EBAY = { id: 1, label: 'eBay' };
const AMAZON = { id: 2, label: 'Amazon' };
const ROWS: SupportListRow[] = [
  row(1, { platform: EBAY, assignees: [{ id: 7, name: 'Ana' }], flags: { ...NO_FLAGS, needs_reply: true } }),
  row(2, { platform: EBAY, status: 'pending', account: { id: 10, label: 'MEKONG' } }),
  row(3, { platform: AMAZON, status: 'solved', flags: { ...NO_FLAGS, needs_reply: true } }),
  row(4, { purpose: 'internal_record', status: 'new', assignees: [{ id: 7, name: 'Ana' }] }),
];

function deps(seen: Array<string | null> = []): NavFacetsDeps {
  return {
    run: async () => [],
    listLocalPickupLines: async () => [],
    exceptionCounts: async () => ({}),
    supportRows: async (_orgId, q) => {
      seen.push(q);
      return ROWS;
    },
    liveFeedFacets: async () => ({ carrier: [], channel: [] }),
  };
}

const caller = { orgId: ORG, permissions: new Set(['support.thread.view']) };

test('one facet context per Support view, Queue included, each with Platform · Account · Assignee', () => {
  const contexts = NAV_FACET_CONTEXTS.filter((context) => context.startsWith('support.'));
  assert.deepEqual(contexts, ['support.queue', ...SUPPORT_LIST_VIEWS.map((view) => `support.${view}`)]);
  for (const context of contexts) {
    assert.deepEqual(NAV_FACET_GROUPS[context].map((group) => group.param), ['platform', 'account', 'assignee']);
  }
});

test('a view total is the list the view shows — the same cut, status chips applied', async () => {
  for (const view of [null, ...SUPPORT_LIST_VIEWS]) {
    for (const status of ['', 'open', 'pending,solved']) {
      const params = new URLSearchParams(status ? { status } : {});
      const result = await getNavFacets(caller, `support.${view ?? 'queue'}` as const, params, deps());
      assert.ok(result.ok);
      const expected = cutSupportList(ROWS, { ...parseSupportListFilter(params), view }, Date.now()).rows.length;
      assert.equal(result.body.total, expected, `${view ?? 'queue'} · ${status || 'every status'}`);
    }
  }
});

test('the context names the view: a stray ?view= never widens or swaps it', async () => {
  const result = await getNavFacets(caller, 'support.needs-reply', new URLSearchParams({ view: 'internal' }), deps());
  assert.ok(result.ok);
  assert.equal(result.body.total, 2);
});

test('facet options are labelled from the rows and counted with their own param removed', async () => {
  const seen: Array<string | null> = [];
  const result = await getNavFacets(caller, 'support.queue', new URLSearchParams({ platform: '1', q: ' 19833 ' }), deps(seen));
  assert.ok(result.ok);
  assert.deepEqual(seen, ['19833']);
  assert.equal(result.body.total, 2);
  const platform = result.body.groups.find((group) => group.id === 'platform');
  assert.deepEqual(platform?.options, [
    { value: '1', label: 'eBay', count: 2 },
    { value: '2', label: 'Amazon', count: 1 },
  ]);
  const assignee = result.body.groups.find((group) => group.id === 'assignee');
  // eBay picked: item 1 (Ana) and item 2 (nobody); Unassigned sorts last.
  assert.deepEqual(assignee?.options, [
    { value: '7', label: 'Ana', count: 1 },
    { value: 'none', label: 'Unassigned', count: 1 },
  ]);
});

test('the Support facets follow the list endpoint gate', async () => {
  const result = await getNavFacets({ orgId: ORG, permissions: new Set() }, 'support.queue', new URLSearchParams(), deps());
  assert.deepEqual(result, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'support.thread.view' });
});
