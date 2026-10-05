import test from 'node:test';
import assert from 'node:assert/strict';

import { AUDIT_ACTION } from '@/lib/audit-logs';

import { runSupportFollowUpDueSweepCore, supportFollowUpDueAlertKey, type SupportFollowUpDueDeps } from './follow-up-due-core';
import { ingestSupportMessageCore, supportSubjectFromBody, type IngestDeps } from './ingest-core';
import type { SupportMessageDraft } from './ingest-types';
import { setSupportPurposeCore } from './item-actions-core';
import { markSupportReplySentCore, recordSupportReplyCore, type ReplyDeps } from './reply-core';
import { resolveSupportItemCore } from './resolve-core';
import { emptyState, fakePostCommit, fakeTransaction, ORG, type FakeState } from './store-fixture';
import { SUPPORT_TIMELINE_ACTIONS, supportTimelineFace } from './timeline-events';
import { pickAnsweredInbound } from './transitions';

const T0 = Date.parse('2026-10-04T12:00:00Z');

function harness(state: FakeState = emptyState(), nowMs = T0) {
  const { postCommit, cap } = fakePostCommit();
  let now = nowMs;
  const transaction = fakeTransaction(state, () => now);
  const ingestDeps: IngestDeps = { transaction, postCommit, now: () => now };
  const sends: Array<{ body: string }> = [];
  const replyDeps: ReplyDeps = {
    transaction,
    now: () => now,
    resolveTransport: (item) => ({
      connected: item.channel === 'zendesk' && item.helpdeskConfigured !== false,
      channel: item.channel,
      label: item.channel,
      openUrl: null,
      marketplacePolicy: false,
      maxLength: null,
    }),
    isHelpdeskConnected: async () => true,
    applyMarketplacePolicy: (_c, body) => ({ body, changes: [] }),
    sendViaTransport: async (_org, args) => {
      sends.push({ body: args.body });
      return { ok: true, externalMessageId: `zendesk:comment:${sends.length}` };
    },
  };
  return {
    state,
    cap,
    sends,
    ingestDeps,
    replyDeps,
    actionDeps: { transaction, now: () => now, postCommit },
    advance: (ms: number) => {
      now += ms;
    },
    at: () => now,
  };
}

function inbound(over: Partial<SupportMessageDraft> = {}): SupportMessageDraft {
  return {
    orgId: ORG,
    source: 'zendesk_sync',
    channel: 'zendesk',
    externalConversationId: '48120',
    direction: 'inbound',
    body: 'My speaker arrived dead.',
    requester: { email: 'jo@example.com' },
    purpose: { value: 'customer_conversation', source: 'staff', acknowledgedByStaffId: 1 },
    assigneeStaffIds: [2, 3],
    ...over,
  };
}

test('supportSubjectFromBody: first non-empty line, trimmed, capped at 120 with an ellipsis', () => {
  assert.equal(supportSubjectFromBody('\n  \n  Speaker arrived dead  \nmore text'), 'Speaker arrived dead');
  assert.equal(supportSubjectFromBody('   \n\t'), null);
  const long = supportSubjectFromBody('x'.repeat(200))!;
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('…'));
  assert.equal(supportSubjectFromBody('y'.repeat(120)), 'y'.repeat(120));
});

test('ingest: a new item with no subject is named by its first message; a given subject wins; existing items are not renamed', async () => {
  const h = harness();
  const a = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:1', body: '\nWrong color sent\nPlease swap.' }), h.ingestDeps);
  assert.ok(a.ok);
  assert.equal(h.state.items[0].subject, 'Wrong color sent');
  await ingestSupportMessageCore(inbound({ externalMessageId: 'c:2', body: 'A later line' }), h.ingestDeps);
  assert.equal(h.state.items[0].subject, 'Wrong color sent');
  const b = await ingestSupportMessageCore(
    inbound({ externalConversationId: '48121', externalMessageId: 'c:3', subject: 'Return request', body: 'Hi there' }),
    h.ingestDeps,
  );
  assert.ok(b.ok);
  assert.equal(h.state.items.find((i) => i.id === b.supportItemId)!.subject, 'Return request');
});

test('pickAnsweredInbound: named ids win; default is every pending message at or before the reply', () => {
  const pending = [
    { id: 1, occurredAt: '2026-10-04T10:00:00Z' },
    { id: 2, occurredAt: '2026-10-04T11:00:00Z' },
    { id: 3, occurredAt: '2026-10-04T13:00:00Z' },
  ];
  assert.deepEqual(pickAnsweredInbound(pending, null, '2026-10-04T12:00:00Z'), [1, 2]);
  assert.deepEqual(pickAnsweredInbound(pending, [3, 99], '2026-10-04T12:00:00Z'), [3]);
});

test('ingest: a new customer conversation opens item + thread + pending message + task with owners, queues a draft', async () => {
  const h = harness();
  const out = await ingestSupportMessageCore(inbound({ externalMessageId: 'zendesk:comment:1' }), h.ingestDeps);
  assert.ok(out.ok);
  assert.equal(out.createdItem, true);
  assert.equal(out.createdTask, true);
  assert.equal(out.idempotent, false);
  const item = h.state.items[0];
  assert.equal(item.pendingInboundCount, 1);
  assert.equal(item.primaryTaskId, out.taskId);
  assert.deepEqual(h.state.tasks[0].ownerIds, [2, 3]);
  assert.equal(h.state.messages[0].replyDisposition, 'pending');
  // The new task's owners hear it through the create-task assignment notice, not a second alert.
  assert.deepEqual(h.cap.newTasks, [{ taskId: out.taskId, assigneeStaffIds: [2, 3] }]);
  assert.equal(h.cap.alerts.length, 0);
  assert.equal(h.state.drafts.length, 1);
  assert.equal(h.state.drafts[0].sourceMessageId, out.messageId);
  assert.deepEqual(h.cap.drafts, [out.supportItemId]);
  // A customer message is on the task Timeline but does not stamp "last followed up".
  assert.equal(h.state.followUps[0].channel, 'message');
  assert.equal(h.state.followUps[0].direction, 'inbound');
  assert.equal(h.state.followUps[0].stampLastFollowUp, false);
  assert.ok(h.state.events.some((e) => e.action === AUDIT_ACTION.WORK_TASK_THROW));
});

test('ingest: idempotent replay (same external message id) writes nothing and fires nothing', async () => {
  const h = harness();
  const first = await ingestSupportMessageCore(inbound({ externalMessageId: 'zendesk:comment:1' }), h.ingestDeps);
  assert.ok(first.ok);
  const before = structuredClone(h.state);
  const capBefore = structuredClone(h.cap);
  const again = await ingestSupportMessageCore(inbound({ externalMessageId: 'zendesk:comment:1' }), h.ingestDeps);
  assert.ok(again.ok);
  assert.equal(again.idempotent, true);
  assert.equal(again.messageId, first.messageId);
  assert.equal(again.supportItemId, first.supportItemId);
  assert.deepEqual(again.alertedStaffIds, []);
  assert.deepEqual(h.state, before);
  assert.deepEqual(h.cap, capBefore);
});

test('ingest: a follow-up before any reply stales the old draft, re-drafts on the new boundary and alerts "Customer followed up"', async () => {
  const h = harness();
  const first = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:1' }), h.ingestDeps);
  assert.ok(first.ok);
  h.advance(60_000);
  const second = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:2', body: 'Hello? Anyone?' }), h.ingestDeps);
  assert.ok(second.ok);
  assert.equal(h.state.items[0].pendingInboundCount, 2);
  const [old, fresh] = h.state.drafts;
  assert.equal(old.status, 'stale');
  assert.equal(old.staleReason, 'new_inbound');
  assert.equal(fresh.status, 'pending');
  assert.equal(fresh.sourceMessageId, second.messageId);
  assert.equal(h.cap.alerts.length, 1);
  assert.equal(h.cap.alerts[0].alertKey, `support-inbound:${second.messageId}`);
  assert.match(h.cap.alerts[0].note, /^Customer followed up · Support #\d+/);
  assert.deepEqual(second.alertedStaffIds, [2, 3]);
});

test('ingest: a later customer message reopens resolved work (task back to To do) and re-alerts', async () => {
  const h = harness();
  const first = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:1' }), h.ingestDeps);
  assert.ok(first.ok);
  const reply = await recordSupportReplyCore(
    { orgId: ORG, supportItemId: first.supportItemId, staffId: 2, action: 'log', body: 'Replacement shipped.', clientEventId: 'reply-0001' },
    h.replyDeps,
  );
  assert.ok(reply.ok);
  const resolved = await resolveSupportItemCore({ orgId: ORG, supportItemId: first.supportItemId, staffId: 2 }, h.actionDeps);
  assert.ok(resolved.ok);
  assert.equal(h.state.tasks[0].status, 'DONE');

  h.advance(3_600_000);
  const later = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:3', body: 'It broke again.' }), h.ingestDeps);
  assert.ok(later.ok);
  assert.equal(later.reopened, true);
  assert.equal(h.state.items[0].lifecycle, 'open');
  assert.equal(h.state.items[0].resolvedAt, null);
  assert.equal(h.state.tasks[0].status, 'OPEN');
  assert.equal(h.state.tasks[0].taskState, null);
  assert.ok(h.state.events.some((e) => e.action === AUDIT_ACTION.SUPPORT_ITEM_REOPEN));
  assert.deepEqual(h.cap.alerts.map((a) => a.alertKey), [`support-inbound:${later.messageId}`]);
  assert.match(h.cap.alerts[0].note, /^New customer message/);
});

test('ingest: backfill mode stores and recounts but creates no task, no draft, no alert, no reopen', async () => {
  const h = harness();
  const out = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:1', mode: 'backfill' }), h.ingestDeps);
  assert.ok(out.ok);
  assert.equal(out.taskId, null);
  assert.equal(out.createdTask, false);
  assert.equal(h.state.tasks.length, 0);
  assert.equal(h.state.drafts.length, 0);
  assert.equal(h.state.items[0].pendingInboundCount, 1);
  assert.deepEqual(h.cap, { alerts: [], newTasks: [], drafts: [] });

  h.state.items[0].lifecycle = 'resolved';
  h.state.items[0].resolvedAt = new Date(T0).toISOString();
  h.advance(60_000);
  const late = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:2', mode: 'backfill' }), h.ingestDeps);
  assert.ok(late.ok);
  assert.equal(late.reopened, false);
  assert.equal(h.state.items[0].lifecycle, 'resolved');
});

test('reply (log): answers every pending message, recounts to zero, logs ONE follow-up row, marks the draft used', async () => {
  const h = harness();
  const a = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:1' }), h.ingestDeps);
  h.advance(1000);
  await ingestSupportMessageCore(inbound({ externalMessageId: 'c:2', body: 'Still waiting' }), h.ingestDeps);
  assert.ok(a.ok);
  const draftId = h.state.drafts.find((d) => d.status === 'pending')!.id;
  h.advance(1000);
  const r = await recordSupportReplyCore(
    { orgId: ORG, supportItemId: a.supportItemId, staffId: 2, action: 'log', body: 'Sorry — sending a new one.', draftId, clientEventId: 'reply-0001' },
    h.replyDeps,
  );
  assert.ok(r.ok);
  assert.equal(r.deliveryState, 'logged');
  assert.equal(r.answeredMessageIds.length, 2);
  assert.equal(h.state.items[0].pendingInboundCount, 0);
  assert.equal(h.state.drafts.find((d) => d.id === draftId)!.status, 'used');
  const outboundRows = h.state.followUps.filter((f) => f.direction === 'outbound');
  assert.equal(outboundRows.length, 1);
  assert.equal(outboundRows[0].threadMessageId, r.messageId);
  assert.equal(outboundRows[0].stampLastFollowUp, true);
  // Retried request: same clientEventId → nothing new.
  const again = await recordSupportReplyCore(
    { orgId: ORG, supportItemId: a.supportItemId, staffId: 2, action: 'log', body: 'Sorry — sending a new one.', clientEventId: 'reply-0001' },
    h.replyDeps,
  );
  assert.ok(again.ok);
  assert.equal(again.idempotent, true);
  assert.equal(h.state.followUps.filter((f) => f.direction === 'outbound').length, 1);
});

test('reply (copy_open): stored copied and answers nothing until Mark sent; Mark sent answers and applies the saved next step', async () => {
  const h = harness();
  const a = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:1' }), h.ingestDeps);
  assert.ok(a.ok);
  h.advance(1000);
  const nextFollowUpAt = new Date(T0 + 3 * 86_400_000).toISOString();
  const copied = await recordSupportReplyCore(
    {
      orgId: ORG,
      supportItemId: a.supportItemId,
      staffId: 2,
      action: 'copy_open',
      body: 'We will ship a replacement.',
      nextStep: { kind: 'follow_up_later', nextFollowUpAt },
      clientEventId: 'reply-copy-1',
    },
    h.replyDeps,
  );
  assert.ok(copied.ok);
  assert.equal(copied.deliveryState, 'copied');
  assert.deepEqual(copied.answeredMessageIds, []);
  assert.equal(h.state.items[0].pendingInboundCount, 1);
  assert.equal(h.state.followUps.filter((f) => f.direction === 'outbound').length, 0);
  assert.equal(h.sends.length, 0);
  const blocked = await resolveSupportItemCore({ orgId: ORG, supportItemId: a.supportItemId, staffId: 2 }, h.actionDeps);
  assert.ok(!blocked.ok && blocked.status === 409);
  assert.ok(blocked.blockers.includes('send_pending'));

  const sent = await markSupportReplySentCore({ orgId: ORG, supportItemId: a.supportItemId, messageId: copied.messageId, staffId: 2 }, h.actionDeps);
  assert.ok(sent.ok);
  assert.deepEqual(sent.answeredMessageIds, [a.messageId]);
  assert.equal(h.state.items[0].pendingInboundCount, 0);
  assert.equal(h.state.messages.find((m) => m.id === copied.messageId)!.deliveryState, 'sent');
  assert.equal(h.state.tasks[0].taskState, 'FOLLOW_UP');
  assert.equal(h.state.tasks[0].nextFollowUpAt, nextFollowUpAt);
  const replay = await markSupportReplySentCore({ orgId: ORG, supportItemId: a.supportItemId, messageId: copied.messageId, staffId: 2 }, h.actionDeps);
  assert.ok(replay.ok && replay.idempotent);
});

test('reply: customer sends are refused unless the purpose is customer_conversation', async () => {
  const h = harness();
  const a = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:1', purpose: null }), h.ingestDeps);
  assert.ok(a.ok);
  const r = await recordSupportReplyCore(
    { orgId: ORG, supportItemId: a.supportItemId, staffId: 2, action: 'send', body: 'Hi', clientEventId: 'reply-0009' },
    h.replyDeps,
  );
  assert.ok(!r.ok);
  assert.equal(r.status, 422);
  assert.equal(h.sends.length, 0);
});

test('reply (send) + waiting_customer: sent through the transport, task held PENDING, item waiting on customer', async () => {
  const h = harness();
  const a = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:1' }), h.ingestDeps);
  assert.ok(a.ok);
  const r = await recordSupportReplyCore(
    {
      orgId: ORG,
      supportItemId: a.supportItemId,
      staffId: 2,
      action: 'send',
      body: 'Can you send a photo?',
      nextStep: { kind: 'waiting_customer' },
      clientEventId: 'reply-send-1',
    },
    h.replyDeps,
  );
  assert.ok(r.ok);
  assert.equal(r.deliveryState, 'sent');
  assert.equal(h.sends.length, 1);
  assert.equal(h.state.items[0].lifecycle, 'waiting_customer');
  assert.equal(h.state.tasks[0].taskState, 'PENDING');
  // The customer answers: back to open, hold released.
  h.advance(60_000);
  await ingestSupportMessageCore(inbound({ externalMessageId: 'c:2', body: 'Photo attached' }), h.ingestDeps);
  assert.equal(h.state.items[0].lifecycle, 'open');
  assert.equal(h.state.tasks[0].taskState, null);
});

async function itemWaitingWithChase(h: ReturnType<typeof harness>, chaseInMs: number) {
  const a = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:1' }), h.ingestDeps);
  assert.ok(a.ok);
  const nextFollowUpAt = new Date(h.at() + chaseInMs).toISOString();
  const r = await recordSupportReplyCore(
    { orgId: ORG, supportItemId: a.supportItemId, staffId: 2, action: 'log', body: 'Checking.', nextStep: { kind: 'waiting_customer', nextFollowUpAt }, clientEventId: 'reply-wait-1' },
    h.replyDeps,
  );
  assert.ok(r.ok);
  assert.equal(h.state.tasks[0].nextFollowUpAt, nextFollowUpAt);
  return { itemId: a.supportItemId, nextFollowUpAt };
}

test('due chase: an answering reply clears a DUE next follow-up, so the item is no longer overdue and can resolve', async () => {
  const h = harness();
  const { itemId } = await itemWaitingWithChase(h, 3_600_000);
  h.advance(2 * 3_600_000);
  await ingestSupportMessageCore(inbound({ externalMessageId: 'c:2', body: 'Here is the photo' }), h.ingestDeps);
  const r = await recordSupportReplyCore(
    { orgId: ORG, supportItemId: itemId, staffId: 2, action: 'log', body: 'Thanks, replacement on the way.', clientEventId: 'reply-due-1' },
    h.replyDeps,
  );
  assert.ok(r.ok);
  assert.equal(h.state.tasks[0].nextFollowUpAt, null);
  const resolved = await resolveSupportItemCore({ orgId: ORG, supportItemId: itemId, staffId: 2 }, h.actionDeps);
  assert.ok(resolved.ok, JSON.stringify(resolved));
});

test('due chase: Mark sent after Copy & open also clears a due follow-up', async () => {
  const h = harness();
  const { itemId } = await itemWaitingWithChase(h, 3_600_000);
  h.advance(2 * 3_600_000);
  const copied = await recordSupportReplyCore(
    { orgId: ORG, supportItemId: itemId, staffId: 2, action: 'copy_open', body: 'Just checking in.', clientEventId: 'reply-due-copy' },
    h.replyDeps,
  );
  assert.ok(copied.ok);
  assert.notEqual(h.state.tasks[0].nextFollowUpAt, null, 'copied answers nothing, so the chase is still due');
  await markSupportReplySentCore({ orgId: ORG, supportItemId: itemId, messageId: copied.messageId, staffId: 2 }, h.actionDeps);
  assert.equal(h.state.tasks[0].nextFollowUpAt, null);
});

test('due chase: a FUTURE next follow-up survives a reply without a next step', async () => {
  const h = harness();
  const { itemId, nextFollowUpAt } = await itemWaitingWithChase(h, 3 * 86_400_000);
  h.advance(3_600_000);
  await ingestSupportMessageCore(inbound({ externalMessageId: 'c:2', body: 'One more question' }), h.ingestDeps);
  await recordSupportReplyCore(
    { orgId: ORG, supportItemId: itemId, staffId: 2, action: 'log', body: 'Answered.', clientEventId: 'reply-future-1' },
    h.replyDeps,
  );
  assert.equal(h.state.tasks[0].nextFollowUpAt, nextFollowUpAt);
});

test('due chase: the next step replaces a due follow-up with its own date', async () => {
  const h = harness();
  const { itemId } = await itemWaitingWithChase(h, 3_600_000);
  h.advance(2 * 3_600_000);
  const next = new Date(h.at() + 2 * 86_400_000).toISOString();
  await recordSupportReplyCore(
    { orgId: ORG, supportItemId: itemId, staffId: 2, action: 'log', body: 'Chasing again.', nextStep: { kind: 'follow_up_later', nextFollowUpAt: next }, clientEventId: 'reply-due-next' },
    h.replyDeps,
  );
  assert.equal(h.state.tasks[0].nextFollowUpAt, next);
  assert.equal(h.state.tasks[0].taskState, 'FOLLOW_UP');
});

test('resolve: refused with an unanswered customer message, allowed once it is answered; re-resolve is a no-op', async () => {
  const h = harness();
  const a = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:1' }), h.ingestDeps);
  assert.ok(a.ok);
  const refused = await resolveSupportItemCore({ orgId: ORG, supportItemId: a.supportItemId, staffId: 2 }, h.actionDeps);
  assert.ok(!refused.ok && refused.status === 409);
  assert.deepEqual(refused.blockers, ['unanswered_inbound']);
  assert.equal(h.state.tasks[0].status, 'OPEN');

  await recordSupportReplyCore(
    { orgId: ORG, supportItemId: a.supportItemId, staffId: 2, action: 'log', body: 'Done.', clientEventId: 'reply-0002' },
    h.replyDeps,
  );
  const ok = await resolveSupportItemCore({ orgId: ORG, supportItemId: a.supportItemId, staffId: 2 }, h.actionDeps);
  assert.ok(ok.ok);
  assert.equal(ok.override, false);
  assert.equal(h.state.items[0].lifecycle, 'resolved');
  assert.equal(h.state.tasks[0].status, 'DONE');
  assert.deepEqual(h.state.checkInRefreshes.at(-1), a.supportItemId);
  const again = await resolveSupportItemCore({ orgId: ORG, supportItemId: a.supportItemId, staffId: 2 }, h.actionDeps);
  assert.ok(again.ok && again.idempotent);
});

test('resolve: an override needs a reason; with one it resolves past blockers and records why', async () => {
  const h = harness();
  const a = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:1' }), h.ingestDeps);
  assert.ok(a.ok);
  const noReason = await resolveSupportItemCore({ orgId: ORG, supportItemId: a.supportItemId, staffId: 2, override: true }, h.actionDeps);
  assert.ok(!noReason.ok && noReason.status === 422);
  assert.equal(h.state.items[0].lifecycle, 'open');
  const ok = await resolveSupportItemCore(
    { orgId: ORG, supportItemId: a.supportItemId, staffId: 2, override: true, reason: 'Customer called; handled by phone.' },
    h.actionDeps,
  );
  assert.ok(ok.ok);
  assert.equal(ok.override, true);
  assert.deepEqual(ok.blockers, ['unanswered_inbound']);
  const ev = h.state.events.find((e) => e.action === AUDIT_ACTION.SUPPORT_ITEM_RESOLVE_OVERRIDE);
  assert.equal(ev?.after.reason, 'Customer called; handled by phone.');
});

test('purpose: customer → internal record sets every live draft aside in the same transaction', async () => {
  const h = harness();
  const a = await ingestSupportMessageCore(inbound({ externalMessageId: 'c:1' }), h.ingestDeps);
  assert.ok(a.ok);
  assert.equal(h.state.drafts[0].status, 'pending');
  const r = await setSupportPurposeCore({ orgId: ORG, supportItemId: a.supportItemId, staffId: 1, purpose: 'internal_record' }, h.actionDeps);
  assert.ok(r.ok);
  assert.equal(r.staledDrafts, 1);
  assert.equal(h.state.drafts[0].status, 'stale');
  assert.equal(h.state.drafts[0].staleReason, 'purpose_internal');
  assert.equal(h.state.items[0].purpose, 'internal_record');
  assert.equal(h.state.items[0].purposeSource, 'staff');
});

test('follow-up due sweep: one alert per task per due instant (the key carries the epoch ms)', async () => {
  const due = '2026-10-04T09:00:00.000Z';
  const sent = new Map<string, number[]>();
  const keys: string[] = [];
  const deps: SupportFollowUpDueDeps = {
    wakeSnoozed: async () => 0,
    listDue: async () => [
      { taskId: 41, supportItemId: 7, nextFollowUpAt: due, subject: 'Dead speaker', requester: { name: 'Jo', email: null, handle: null } },
    ],
    alert: async (_org, a) => {
      keys.push(a.alertKey);
      if (sent.has(a.alertKey)) return [];
      sent.set(a.alertKey, [2]);
      return [2];
    },
  };
  assert.equal(supportFollowUpDueAlertKey(41, due), `support-follow-up-due:41:${Date.parse(due)}`);
  assert.deepEqual(await runSupportFollowUpDueSweepCore(ORG, T0, deps), { alerted: 1, tasks: [41] });
  assert.deepEqual(await runSupportFollowUpDueSweepCore(ORG, T0 + 600_000, deps), { alerted: 0, tasks: [] });
  assert.deepEqual(keys, [`support-follow-up-due:41:${Date.parse(due)}`, `support-follow-up-due:41:${Date.parse(due)}`]);
});

test('timeline: every support event verb is a registered audit action and paints words', () => {
  const values = new Set<string>(Object.values(AUDIT_ACTION));
  for (const action of SUPPORT_TIMELINE_ACTIONS) assert.ok(values.has(action), action);
  assert.deepEqual(supportTimelineFace('support.message.no_reply', { reason: 'Thanks-only message' }), {
    title: 'Marked no reply required',
    detail: 'Thanks-only message',
  });
  assert.equal(supportTimelineFace('support.reply', { deliveryState: 'sent' }), null);
  assert.equal(supportTimelineFace('support.reply', { deliveryState: 'copied', preview: 'Hi' })?.title, 'Reply copied — not confirmed sent');
});
