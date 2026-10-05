import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { IngestSupportMessageResult, SupportMessageDraft } from '@/lib/support/conversation/ingest-types';
import type { OrderCheckInState, OrderCheckInView } from '@/lib/support/conversation/model';
import type { OrderGroupFacts } from '@/lib/support/orders/order-facts';
import { checkInOpeningKey, runOrderCheckInSweep, type DueCheckInRow, type OrderCheckInSweepDeps } from './sweep';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const NOW = Date.parse('2026-10-12T00:00:00Z');

function order(id: number, extra: Partial<OrderGroupFacts> = {}): OrderGroupFacts {
  return {
    representativeOrderId: id,
    lineIds: [id],
    orderNumber: `22-15228-${id}`,
    accountSource: 'DRAGON',
    platform: { slug: 'ebay', accountLabel: 'DRAGON', platformAccountId: 1 },
    statuses: ['shipped'],
    anyAfn: false,
    pickup: false,
    customer: { name: 'Ada Buyer', email: 'ada@example.com', phone: null },
    adminUrl: null,
    products: [],
    shipments: [],
    shipConfirmAt: null,
    ...extra,
  };
}

function view(itemId: number, state: OrderCheckInState): OrderCheckInView {
  return {
    orderId: 1, orderNumber: null, state, triggerKind: 'delivered', triggerAt: null, dueAt: null,
    supportItemId: itemId, taskId: null, contactedAt: null, contactMessageId: null, contactFollowUpId: null,
    latestInboundMessageId: null, nextFollowUpAt: null, chaseCount: 0, disposition: null, dispositionReason: null,
    closedAt: null, closedBy: null,
  };
}

/**
 * A fake world modelled on the real seams: ingest is idempotent by the
 * opening key (like ingestSupportMessage's externalMessageId check), and an
 * opened row leaves the due-unopened list (refresh links it).
 */
function world(opts: { due: DueCheckInRow[]; orders: OrderGroupFacts[]; open?: Array<{ supportItemId: number; state: OrderCheckInState }>; refreshTo?: OrderCheckInState }) {
  const items = new Map<string, number>();
  const linked = new Set<number>();
  const cap = { drafts: [] as SupportMessageDraft[], refreshed: [] as number[], projected: 0, warnings: [] as string[] };
  let nextItem = 100;
  const deps: OrderCheckInSweepDeps = {
    project: async (org) => {
      assert.equal(org, ORG);
      cap.projected++;
      return 2;
    },
    listDueUnopened: async () => opts.due.filter((r) => !linked.has(r.orderId)),
    loadOrder: async (_org, id) => opts.orders.find((o) => o.lineIds.includes(id)) ?? null,
    designatedAssignees: async () => [],
    ingest: async (draft): Promise<IngestSupportMessageResult> => {
      cap.drafts.push(draft);
      const key = String(draft.externalMessageId);
      const existing = items.get(key);
      const supportItemId = existing ?? nextItem++;
      items.set(key, supportItemId);
      return {
        ok: true, supportItemId, threadId: supportItemId, messageId: supportItemId, taskId: supportItemId,
        createdItem: existing == null, createdTask: existing == null, reopened: false, idempotent: existing != null,
        alertedStaffIds: [], draftId: existing == null ? 1 : null,
      };
    },
    listOpenCheckInItems: async () => opts.open ?? [],
    refreshItem: async (_org, itemId) => {
      cap.refreshed.push(itemId);
      const orderId = [...items.entries()].find(([, v]) => v === itemId)?.[0];
      if (orderId) linked.add(Number(orderId.split(':').pop()));
      return view(itemId, opts.refreshTo ?? 'due');
    },
    warn: (m) => cap.warnings.push(m),
  };
  return { deps, cap, items };
}

test('opens one check-in item per due order through the waist, with the program shape', async () => {
  const { deps, cap } = world({
    due: [{ orderId: 7, dueAt: '2026-10-08T00:00:00.000Z' }],
    orders: [order(7, { lineIds: [7, 8] })],
  });
  const out = await runOrderCheckInSweep(ORG, NOW, deps);
  assert.deepEqual(out, { projected: 2, opened: 1, followUpDue: 0 });
  assert.equal(cap.drafts.length, 1);
  const d = cap.drafts[0];
  assert.equal(d.orgId, ORG);
  assert.equal(d.source, 'check_in_program');
  assert.equal(d.kind, 'post_purchase_check_in');
  assert.deepEqual(d.purpose, { value: 'customer_conversation', source: 'program', acknowledgedByStaffId: null });
  assert.equal(d.direction, 'internal');
  assert.equal(d.channel, 'ebay');
  assert.equal(d.body, 'Post-purchase check-in due for order 22-15228-7');
  assert.deepEqual(d.orderLinks, [{ orderId: 7, primary: true, externalReference: null }]);
  assert.deepEqual(d.requester, { name: 'Ada Buyer', email: 'ada@example.com', handle: null });
  assert.deepEqual(d.assigneeStaffIds, [], 'no designated assignee → Unassigned');
  assert.equal(d.externalMessageId, checkInOpeningKey(7));
  assert.equal(d.clientEventId, checkInOpeningKey(7));
  assert.equal(d.mode, 'live');
  assert.deepEqual(cap.refreshed, [100]);
});

test('idempotent: a replayed sweep (row still listed due) never creates a second item for the order', async () => {
  const due = [{ orderId: 7, dueAt: '2026-10-08T00:00:00.000Z' }];
  const w = world({ due, orders: [order(7)] });
  // Simulate the link not having landed (refresh failed): the row stays due.
  const stuck: OrderCheckInSweepDeps = { ...w.deps, listDueUnopened: async () => due };
  const first = await runOrderCheckInSweep(ORG, NOW, stuck);
  const second = await runOrderCheckInSweep(ORG, NOW + 600_000, stuck);
  assert.equal(first.opened, 1);
  assert.equal(second.opened, 0);
  assert.equal(w.items.size, 1);
  assert.equal(w.cap.drafts[0].externalMessageId, w.cap.drafts[1].externalMessageId, 'same per-order key both times');
  assert.deepEqual(w.cap.refreshed, [100, 100], 'the replay re-links the SAME item');
});

test('a channel follows the platform; no email/marketplace → phone → manual', async () => {
  const { deps, cap } = world({
    due: [
      { orderId: 1, dueAt: '2026-10-08T00:00:00.000Z' },
      { orderId: 2, dueAt: '2026-10-08T00:00:00.000Z' },
      { orderId: 3, dueAt: '2026-10-08T00:00:00.000Z' },
    ],
    orders: [
      order(1, { platform: { slug: 'ecwid', accountLabel: null, platformAccountId: null } }),
      order(2, { platform: { slug: 'walmart', accountLabel: null, platformAccountId: null } }),
      order(3, { pickup: true, platform: { slug: 'phone', accountLabel: null, platformAccountId: null }, customer: { name: 'Walk In', email: null, phone: '714' } }),
    ],
  });
  await runOrderCheckInSweep(ORG, NOW, deps);
  assert.deepEqual(cap.drafts.map((d) => d.channel), ['ecwid', 'email', 'phone']);
});

test('refusals and vanished orders are skipped, not counted, and warned', async () => {
  const w = world({ due: [{ orderId: 9, dueAt: '2026-10-08T00:00:00.000Z' }, { orderId: 10, dueAt: '2026-10-08T00:00:00.000Z' }], orders: [order(10)] });
  const deps: OrderCheckInSweepDeps = {
    ...w.deps,
    ingest: async () => ({ ok: false, status: 422, error: 'nope' }),
  };
  const out = await runOrderCheckInSweep(ORG, NOW, deps);
  assert.equal(out.opened, 0);
  assert.equal(w.cap.warnings.length, 2);
  assert.deepEqual(w.cap.refreshed, []);
});

test('followUpDue counts open check-ins that newly fell due on this pass', async () => {
  const { deps } = world({
    due: [],
    orders: [],
    open: [
      { supportItemId: 50, state: 'contacted' },
      { supportItemId: 51, state: 'follow_up_due' },
    ],
    refreshTo: 'follow_up_due',
  });
  const out = await runOrderCheckInSweep(ORG, NOW, deps);
  assert.deepEqual(out, { projected: 2, opened: 0, followUpDue: 1 });
});
