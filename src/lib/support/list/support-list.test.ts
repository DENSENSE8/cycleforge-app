import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { OrgId } from '@/lib/tenancy/constants';
import { SUPPORT_LOCAL_STATUSES, SUPPORT_WORK_FLAGS, type SupportLocalStatus, type SupportWorkFlags } from '@/lib/support/conversation/model';

import {
  SUPPORT_LIST_DEFAULT_FILTER,
  SUPPORT_LIST_VIEWS,
  cutSupportList,
  parseSupportListFilter,
  supportListFacetCounts,
  supportListFacetValues,
  supportListGroupOf,
  supportListViewMatches,
  supportUrgencyRank,
  type SupportListFacet,
  type SupportListFilter,
  type SupportListRow,
  type SupportListView,
} from './support-list';
import { SUPPORT_LIST_SQL, listSupportRows, supportListSearchTerms } from './support-list-db';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const NOW = Date.parse('2026-10-04T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * HOUR).toISOString();

const NO_FLAGS: SupportWorkFlags = Object.fromEntries(SUPPORT_WORK_FLAGS.map((f) => [f, false])) as SupportWorkFlags;

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
    lastActivityAt: at(itemId),
    nextFollowUpAt: null,
    deadlineAt: null,
    urgent: false,
    resolvedAt: null,
    createdAt: at(100 + itemId),
    checkInState: null,
    ...over,
  };
}

const PLATFORMS = [null, { id: 1, label: 'eBay' }, { id: 2, label: 'Amazon' }];
const ACCOUNTS = [null, { id: 10, label: 'MEKONG' }, { id: null, label: 'usav-main' }, { id: 11, label: 'Ecwid store' }];
const OWNERS = [[], [{ id: 1, name: 'Michael' }], [{ id: 1, name: 'Michael' }, { id: 2, name: 'Thuc' }], [{ id: 3, name: 'Ana' }]];

/** Every status × every flag (alone and in pairs), spread over platforms, accounts, owners, purposes and kinds. */
const FIXTURE: SupportListRow[] = (() => {
  const out: SupportListRow[] = [];
  let id = 1;
  const flagSets: SupportWorkFlags[] = [NO_FLAGS];
  for (const f of SUPPORT_WORK_FLAGS) flagSets.push({ ...NO_FLAGS, [f]: true });
  for (let i = 0; i < SUPPORT_WORK_FLAGS.length; i++) {
    flagSets.push({ ...NO_FLAGS, [SUPPORT_WORK_FLAGS[i]]: true, [SUPPORT_WORK_FLAGS[(i + 2) % SUPPORT_WORK_FLAGS.length]]: true });
  }
  for (const status of SUPPORT_LOCAL_STATUSES) {
    for (const flags of flagSets) {
      const n = id;
      const pending = flags.needs_reply ? (flags.customer_followed_up ? 2 : 1) : 0;
      out.push(
        row(n, {
          status,
          lifecycle: status === 'solved' || status === 'closed' ? 'resolved' : status === 'on_hold' ? 'snoozed' : status === 'pending' ? 'waiting_customer' : 'open',
          flags,
          purpose: n % 5 === 0 ? 'internal_record' : flags.unclassified ? 'unclassified' : 'customer_conversation',
          kind: n % 7 === 0 ? 'post_purchase_check_in' : 'conversation',
          platform: PLATFORMS[n % PLATFORMS.length],
          account: ACCOUNTS[n % ACCOUNTS.length],
          assignees: flags.unassigned ? [] : OWNERS[n % OWNERS.length],
          pendingInboundCount: pending,
          lastInboundAt: pending > 0 ? at((n * 7) % 50) : null,
          nextFollowUpAt: n % 3 === 0 ? at(-(n % 11)) : null,
          deadlineAt: n % 4 === 0 ? at(-(n % 13) - 1) : null,
        }),
      );
      id += 1;
    }
  }
  return out;
})();

const VIEWS: (SupportListView | null)[] = [null, ...SUPPORT_LIST_VIEWS];

function filterOf(over: Partial<SupportListFilter>): SupportListFilter {
  return { ...SUPPORT_LIST_DEFAULT_FILTER, ...over };
}

/** Facet scopes the count laws are checked under (none, one, several). */
const FACET_SCOPES: Partial<SupportListFilter>[] = [
  {},
  { platformIds: [1] },
  { accounts: ['MEKONG', 'usav-main'] },
  { assignees: ['none', 3] },
  { platformIds: [1, 2], assignees: [1] },
];

test('the fixture covers every status and every flag', () => {
  for (const s of SUPPORT_LOCAL_STATUSES) assert.ok(FIXTURE.some((r) => r.status === s), s);
  for (const f of SUPPORT_WORK_FLAGS) assert.ok(FIXTURE.some((r) => r.flags[f]), f);
});

test('every view × status chip: the chip count is the rows the chip shows', () => {
  for (const view of VIEWS) {
    for (const scope of FACET_SCOPES) {
      const base = cutSupportList(FIXTURE, filterOf({ view, ...scope }), NOW);
      assert.equal(base.total, base.rows.length, `${view} ${JSON.stringify(scope)}: no chip = every status`);
      assert.equal(
        SUPPORT_LOCAL_STATUSES.reduce((sum, s) => sum + base.statusCounts[s], 0),
        base.total,
      );
      for (const s of SUPPORT_LOCAL_STATUSES) {
        const lit = cutSupportList(FIXTURE, filterOf({ view, ...scope, statuses: [s] }), NOW);
        assert.equal(lit.statusCounts[s], lit.rows.length, `${view} ${JSON.stringify(scope)} ${s}`);
        assert.equal(base.statusCounts[s], lit.rows.length, 'the chip count ignores the lit chip');
        assert.ok(lit.rows.every((r) => r.status === s));
      }
      const two: SupportLocalStatus[] = ['solved', 'closed'];
      const both = cutSupportList(FIXTURE, filterOf({ view, ...scope, statuses: two }), NOW);
      assert.equal(both.rows.length, both.statusCounts.solved + both.statusCounts.closed);
    }
  }
});

test('view predicates', () => {
  const expect: Record<SupportListView, (r: SupportListRow) => boolean> = {
    'needs-reply': (r) => r.flags.needs_reply,
    'followed-up': (r) => r.flags.customer_followed_up,
    'draft-ready': (r) => r.flags.draft_ready,
    'follow-up-due': (r) => r.flags.follow_up_due,
    unclassified: (r) => r.flags.unclassified,
    internal: (r) => r.purpose === 'internal_record',
    unassigned: (r) => r.flags.unassigned,
    'sync-failed': (r) => r.flags.sync_failed,
    'check-ins': (r) => r.kind === 'post_purchase_check_in',
  };
  for (const view of SUPPORT_LIST_VIEWS) {
    const { rows } = cutSupportList(FIXTURE, filterOf({ view }), NOW);
    assert.deepEqual(
      rows.map((r) => r.itemId).sort((a, b) => a - b),
      FIXTURE.filter(expect[view]).map((r) => r.itemId).sort((a, b) => a - b),
      view,
    );
    assert.ok(rows.length > 0, `${view} has rows in the fixture`);
  }
  assert.equal(cutSupportList(FIXTURE, filterOf({}), NOW).rows.length, FIXTURE.length);
  assert.equal(supportListViewMatches(row(1), null), true);
});

test('facet counts equal the rows shown when that facet value is applied', () => {
  const facets: SupportListFacet[] = ['platform', 'account', 'assignee'];
  const scopes: Partial<SupportListFilter>[] = [...FACET_SCOPES, { statuses: ['open', 'new'] }, { statuses: ['pending'], platformIds: [2] }];
  for (const view of VIEWS) {
    for (const scope of scopes) {
      const filter = filterOf({ view, ...scope });
      const counts = supportListFacetCounts(FIXTURE, filter, NOW);
      for (const facet of facets) {
        const offered = new Set(FIXTURE.flatMap((r) => supportListFacetValues(r, facet)));
        for (const value of offered) {
          const applied: Partial<SupportListFilter> =
            facet === 'platform'
              ? { platformIds: [Number(value)] }
              : facet === 'account'
                ? { accounts: [value] }
                : { assignees: [value === 'none' ? 'none' : Number(value)] };
          const shown = cutSupportList(FIXTURE, { ...filter, ...applied }, NOW).rows.length;
          assert.equal(counts[facet][value] ?? 0, shown, `${view} ${JSON.stringify(scope)} ${facet}=${value}`);
        }
      }
    }
  }
});

test('assignee facet: a shared item counts for each owner; none = unowned', () => {
  const rows = [
    row(1, { assignees: [{ id: 1, name: 'Michael' }, { id: 2, name: 'Thuc' }] }),
    row(2, { assignees: [] }),
    row(3, { assignees: [{ id: 2, name: 'Thuc' }] }),
  ];
  const counts = supportListFacetCounts(rows, filterOf({}), NOW);
  assert.deepEqual(counts.assignee, { '1': 1, '2': 2, none: 1 });
  assert.deepEqual(
    cutSupportList(rows, filterOf({ assignees: [2, 'none'], sort: 'newest' }), NOW).rows.map((r) => r.itemId),
    [1, 2, 3],
  );
});

test('urgency rank: flags on live work, then status', () => {
  const live = (flags: Partial<SupportWorkFlags>, status: SupportLocalStatus = 'open') => supportUrgencyRank({ status, flags: { ...NO_FLAGS, ...flags } });
  assert.equal(live({ follow_up_due: true, needs_reply: true }), 0);
  assert.equal(live({ customer_followed_up: true, needs_reply: true }), 1);
  assert.equal(live({ needs_reply: true }), 2);
  assert.equal(live({ draft_ready: true }), 3);
  assert.equal(live({ unclassified: true }), 4);
  assert.equal(live({}, 'new'), 5);
  assert.equal(live({}, 'open'), 5);
  assert.equal(live({}, 'pending'), 6);
  assert.equal(live({ follow_up_due: true }, 'pending'), 0, 'a due follow-up on a pending item is loudest');
  assert.equal(live({}, 'on_hold'), 7);
  assert.equal(live({}, 'solved'), 8);
  assert.equal(live({ unclassified: true }, 'solved'), 8, 'flags rank live work only');
  assert.equal(live({}, 'closed'), 9);
});

test('sort: urgency, ties by oldest pending inbound then oldest activity', () => {
  const rows = [
    row(1, { status: 'closed', lifecycle: 'resolved' }),
    row(2, { flags: { ...NO_FLAGS, needs_reply: true }, pendingInboundCount: 1, lastInboundAt: at(2) }),
    row(3, { flags: { ...NO_FLAGS, needs_reply: true }, pendingInboundCount: 1, lastInboundAt: at(9) }),
    row(4, { flags: { ...NO_FLAGS, follow_up_due: true } }),
    row(5, { status: 'pending', lifecycle: 'waiting_customer' }),
    row(6, { status: 'new', lastActivityAt: at(1) }),
    row(7, { status: 'open', lastActivityAt: at(30) }),
    row(8, { status: 'on_hold', lifecycle: 'snoozed' }),
    row(9, { status: 'solved', lifecycle: 'resolved' }),
    row(10, { flags: { ...NO_FLAGS, draft_ready: true } }),
  ];
  assert.deepEqual(
    cutSupportList(rows, filterOf({ sort: 'urgency' }), NOW).rows.map((r) => r.itemId),
    [4, 3, 2, 10, 7, 6, 5, 8, 9, 1],
  );
});

test('sort: newest, oldest-waiting, due', () => {
  const rows = [
    row(1, { lastActivityAt: at(5) }),
    row(2, { lastActivityAt: at(1), pendingInboundCount: 1, lastInboundAt: at(1) }),
    row(3, { lastActivityAt: at(9), pendingInboundCount: 2, lastInboundAt: at(9), nextFollowUpAt: at(-5), deadlineAt: at(-1) }),
    row(4, { lastActivityAt: at(20), deadlineAt: at(-3) }),
    row(5, { lastActivityAt: at(3), nextFollowUpAt: at(2) }),
  ];
  assert.deepEqual(cutSupportList(rows, filterOf({ sort: 'newest' }), NOW).rows.map((r) => r.itemId), [2, 5, 1, 3, 4]);
  assert.deepEqual(cutSupportList(rows, filterOf({ sort: 'oldest-waiting' }), NOW).rows.map((r) => r.itemId), [3, 2, 4, 1, 5]);
  assert.deepEqual(cutSupportList(rows, filterOf({ sort: 'due' }), NOW).rows.map((r) => r.itemId), [5, 3, 4, 1, 2]);
});

test('group: rows stay together in group order, sorted within', () => {
  const { rows } = cutSupportList(FIXTURE, filterOf({ group: 'status', sort: 'newest' }), NOW);
  const order = rows.map((r) => SUPPORT_LOCAL_STATUSES.indexOf(r.status));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  const byPlatform = cutSupportList(FIXTURE, filterOf({ group: 'platform' }), NOW).rows.map((r) => supportListGroupOf(r, 'platform')!.key);
  assert.deepEqual([...new Set(byPlatform)], ['2', '1', 'none'], 'Amazon, eBay (by label), then no platform');
  assert.equal(supportListGroupOf(row(1), 'none'), null);
  assert.equal(supportListGroupOf(row(1), 'assignee')!.label, 'Unassigned');
});

test('parse: URL params → filter', () => {
  assert.deepEqual(parseSupportListFilter(new URLSearchParams('')), SUPPORT_LIST_DEFAULT_FILTER);
  assert.deepEqual(
    parseSupportListFilter(
      new URLSearchParams('view=needs-reply&status=solved,pending,bogus&platform=2,1,x,2&account=MEKONG,usav-main&assignee=3,none,0,3&sort=due&group=platform&q=48120'),
    ),
    {
      view: 'needs-reply',
      statuses: ['pending', 'solved'],
      platformIds: [2, 1],
      accounts: ['MEKONG', 'usav-main'],
      assignees: [3, 'none'],
      sort: 'due',
      group: 'platform',
    },
  );
  assert.deepEqual(
    parseSupportListFilter({ view: 'waiting', status: ['open', 'new'], sort: 'nope', group: ['assignee'], assignee: undefined }),
    { ...SUPPORT_LIST_DEFAULT_FILTER, statuses: ['new', 'open'], group: 'assignee' },
  );
  assert.deepEqual(parseSupportListFilter(new URLSearchParams('status=open&status=closed')).statuses, ['open', 'closed']);
});

test('find terms: a leading # / T- is dropped; digits find ids exactly', () => {
  assert.equal(supportListSearchTerms('  '), null);
  assert.equal(supportListSearchTerms('#'), null);
  assert.deepEqual(supportListSearchTerms('#595'), { pattern: '%595%', exactId: 595 });
  assert.deepEqual(supportListSearchTerms('T-812'), { pattern: '%812%', exactId: 812 });
  assert.deepEqual(supportListSearchTerms('t-812'), { pattern: '%812%', exactId: 812 });
  assert.deepEqual(supportListSearchTerms('16-14873-30704'), { pattern: '%16-14873-30704%', exactId: null });
});

test('listSupportRows: one tenant statement; status, flags and contact face from the row', async () => {
  const calls: Array<{ orgId: OrgId; sql: string; params: unknown[] }> = [];
  const rows = await listSupportRows(
    ORG,
    { q: '#596', nowMs: NOW },
    {
      query: async (orgId, sql, params) => {
        calls.push({ orgId, sql, params });
        return {
          rows: [
            {
              id: '596',
              kind: 'post_purchase_check_in',
              purpose: 'customer_conversation',
              lifecycle: 'open',
              provider: 'ebay',
              external_ticket_id: null,
              subject: 'Check-in · order 04-15228-73411',
              requester_name: null,
              requester_email: 'abc123@members.ebay.com',
              requester_handle: 'buyer_jo',
              account_label: 'old-label',
              account_id: '10',
              account_row_label: 'MEKONG',
              platform_id: '1',
              platform_label: 'eBay',
              pending_inbound_count: 2,
              last_inbound_at: new Date(NOW - HOUR),
              last_outbound_at: null,
              last_activity_at: new Date(NOW - HOUR),
              sync_state: null,
              resolved_at: null,
              created_at: new Date(NOW - 5 * HOUR),
              task_id: 41,
              task_priority: 10,
              next_follow_up_at: new Date(NOW - 1000),
              deadline_at: null,
              assignees: [],
              draft_ready: true,
              check_in_state: 'due',
              order_id: 19475,
              order_number: '04-15228-73411',
              order_platform: 'eBay',
            },
          ],
        };
      },
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sql, SUPPORT_LIST_SQL);
  assert.deepEqual(calls[0].params, [ORG, '%596%', 596]);
  const [r] = rows;
  assert.equal(r.itemId, 596);
  assert.equal(r.status, 'new');
  assert.deepEqual(r.flags, {
    unclassified: false,
    needs_reply: true,
    customer_followed_up: true,
    draft_ready: true,
    follow_up_due: true,
    unassigned: true,
    sync_failed: false,
  });
  assert.deepEqual(r.account, { id: 10, label: 'MEKONG' });
  assert.deepEqual(r.platform, { id: 1, label: 'eBay' });
  assert.equal(r.urgent, true);
  assert.equal(r.checkInState, 'due');
  assert.equal(r.contact.label, 'buyer_jo');
  assert.equal(r.contact.email, null);
  assert.ok(!JSON.stringify(r).includes('members.ebay.com'), 'the row never carries a relay address');

  const none = await listSupportRows(ORG, {}, {
    query: async (orgId, sql, params) => {
      calls.push({ orgId, sql, params });
      return { rows: [] };
    },
  });
  assert.deepEqual(none, []);
  assert.deepEqual(calls[1].params, [ORG, null, null]);
});
