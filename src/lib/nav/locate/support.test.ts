import test from 'node:test';
import assert from 'node:assert/strict';
import { getNavLocate, type NavLocateDeps, type NavLocateResult } from './service';
import { NAV_LOCATE_MAX_MATCHES, NavLocateResponseSchema, type NavLocateResponse } from '@/lib/nav/context/schema';
import { SUPPORT_LOCAL_STATUSES } from '@/lib/support/conversation/model';
import type { SupportListRow } from '@/lib/support/list/support-list';
import { mapSupportListRow } from '@/lib/support/list/support-list-db';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const SUPPORT = new Set(['support.thread.view']);
const NOW = Date.parse('2026-10-04T12:00:00Z');
const RELAY = 'k8x2abc1@members.ebay.com';

/** One `SUPPORT_LIST_SQL` row through the list's own mapper — the contact face is the real one. */
function supportRow(id: number, patch: Record<string, unknown> = {}): SupportListRow {
  return mapSupportListRow(
    {
      id,
      task_id: id + 1000,
      kind: 'conversation',
      purpose: 'customer_conversation',
      lifecycle: 'open',
      pending_inbound_count: 1,
      // Answered before: the customer wrote again → Open (never New).
      last_outbound_at: '2026-10-02T10:00:00Z',
      subject: `Where is my order? (reply to ${RELAY})`,
      provider: 'ebay',
      requester_name: null,
      requester_email: RELAY,
      requester_handle: null,
      platform_id: 1,
      platform_label: 'eBay',
      order_id: 9001,
      order_number: '12-34567-89012',
      order_platform: 'eBay',
      assignees: [],
      last_activity_at: '2026-10-03T10:00:00Z',
      created_at: '2026-10-01T10:00:00Z',
      ...patch,
    },
    NOW,
  );
}

function fakes(rowsFor: (q: string) => SupportListRow[]) {
  const asked: Array<{ orgId: OrgId; q: string }> = [];
  const never = async () => {
    throw new Error('only support is asked');
  };
  const deps: NavLocateDeps = {
    run: never,
    ordersListSql: never,
    inboundCheck: never,
    inboundLines: never,
    inboundAwaiting: never,
    inboundFollowups: never,
    supportRows: async (orgId, q) => {
      asked.push({ orgId, q });
      return rowsFor(q);
    },
  };
  return { deps, asked };
}

async function ok(result: NavLocateResult): Promise<NavLocateResponse> {
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  return NavLocateResponseSchema.parse(result.body);
}

test('support text: the matches open their record, faced without a raw relay address', async () => {
  const rows = [
    supportRow(595),
    supportRow(596, { lifecycle: 'resolved', resolved_at: '2026-09-01T00:00:00Z', pending_inbound_count: 0, requester_name: 'Jane Doe' }),
  ];
  const { deps, asked } = fakes(() => rows);
  const body = await ok(await getNavLocate({ orgId: ORG, permissions: SUPPORT }, 'support', { q: '12-34567' }, deps));

  // One read: the list's own find, with the text as typed.
  assert.deepEqual(asked, [{ orgId: ORG, q: '12-34567' }]);
  assert.deepEqual(body.buckets.map((b) => b.id), [...SUPPORT_LOCAL_STATUSES]);
  assert.deepEqual(body.buckets.map((b) => b.href), SUPPORT_LOCAL_STATUSES.map((s) => `/support?status=${s}`));
  assert.equal(body.buckets.find((b) => b.id === 'closed')?.count, 1);
  assert.equal(body.buckets.reduce((sum, b) => sum + b.count, 0), 2);

  assert.deepEqual(body.entries.map((e) => [e.ref, e.recordHref]), [
    ['#595', '/support?item=595'],
    ['#596', '/support?item=596'],
  ]);
  for (const entry of body.entries) {
    assert.ok(!`${entry.title} ${entry.detail}`.includes('@members.ebay.com'), JSON.stringify(entry));
  }
  assert.equal(body.entries[0]!.title, 'Where is my order? (reply to eBay relay email)');
  assert.equal(body.entries[0]!.detail, 'eBay relay email · eBay · 12-34567-89012');
  assert.equal(body.entries[1]!.detail, 'Jane Doe · eBay · 12-34567-89012');
  assert.deepEqual(body.entries[1]!.buckets, ['closed']);
  assert.equal(body.truncated, 0);
});

test('support text: the typed Support # leads, matches past the cap are counted, not listed', async () => {
  const rows = Array.from({ length: NAV_LOCATE_MAX_MATCHES + 2 }, (_, index) => supportRow(700 + index));
  const { deps } = fakes(() => rows);
  const body = await ok(await getNavLocate({ orgId: ORG, permissions: SUPPORT }, 'support', { q: '#709' }, deps));
  assert.equal(body.entries.length, NAV_LOCATE_MAX_MATCHES);
  assert.equal(body.entries[0]!.ref, '#709');
  assert.equal(body.truncated, 2);
  assert.equal(body.buckets.reduce((sum, b) => sum + b.count, 0), rows.length);
});

test('support refs: each pasted ref is found the same way, one entry per ref', async () => {
  const { deps, asked } = fakes((q) => (q === '595' ? [supportRow(595)] : q === 'ZD-1' ? [supportRow(10), supportRow(11)] : []));
  const body = await ok(
    await getNavLocate({ orgId: ORG, permissions: SUPPORT }, 'support', { refs: '595\nZD-1\nnothing-here' }, deps),
  );
  assert.deepEqual(asked.map((a) => a.q).sort(), ['595', 'ZD-1', 'nothing-here'].sort());
  assert.deepEqual(body.entries.map((e) => [e.ref, e.recordHref, e.buckets]), [
    ['595', '/support?item=595', ['open']],
    ['ZD-1', null, ['open']],
    ['nothing-here', null, []],
  ]);
  assert.equal(body.entries[1]!.detail, '2 Support items');
  assert.equal(body.buckets.find((b) => b.id === 'open')?.count, 2);
});

test('support needs support.thread.view and is never asked under everywhere', async () => {
  const { deps, asked } = fakes(() => [supportRow(595)]);
  const denied = await getNavLocate({ orgId: ORG, permissions: new Set() }, 'support', { q: '595' }, deps);
  assert.deepEqual(denied, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'support.thread.view' });
  const everywhere = await ok(await getNavLocate({ orgId: ORG, permissions: SUPPORT }, 'everywhere', { refs: '595\n596' }, deps));
  assert.deepEqual(everywhere.buckets, []);
  assert.deepEqual(asked, []);
});
