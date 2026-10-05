import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { TicketMirror } from '@/lib/support/ticket-mirror';
import { planMirrorIngest, zendeskCommentMessageId } from './zendesk-comments';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const CUSTOMER = 501;
const AGENT = 900;

function comment(id: number, over: Record<string, unknown>) {
  return { id, author_id: CUSTOMER, body: `body ${id}`, public: true, created_at: '2026-10-01T10:00:00Z', ...over };
}

function mirror(comments: Array<Record<string, unknown>>): Pick<TicketMirror, 'ticket' | 'comments' | 'agents' | 'requester'> {
  return {
    ticket: { id: 48120, subject: ' Broken remote ', status: 'solved', priority: null, created_at: '', updated_at: '' },
    comments: comments as TicketMirror['comments'],
    agents: [{ id: AGENT, name: 'Ana', email: 'ana@usav.com', role: 'agent', photo: null }],
    requester: { id: CUSTOMER, name: 'Jo', email: 'jo@example.com' },
  };
}

test('classification: customer public → inbound, agent / staff public → outbound sent, private → internal', () => {
  const plan = planMirrorIngest({
    orgId: ORG,
    supportItemId: 7,
    mode: 'live',
    existingMessageIds: new Set(),
    mirror: mirror([
      comment(1, {}),
      comment(2, { author_id: AGENT, created_at: '2026-10-01T11:00:00Z' }),
      comment(3, { author_id: 777, author_staff_id: 12, created_at: '2026-10-01T12:00:00Z' }),
      comment(4, { author_id: 778, author_is_agent: true, created_at: '2026-10-01T13:00:00Z' }),
      comment(5, { author_id: AGENT, public: false, created_at: '2026-10-01T14:00:00Z' }),
      comment(6, { author_id: -1, created_at: '2026-10-01T15:00:00Z' }),
    ]),
  });
  assert.deepEqual(
    plan.drafts.map((d) => [d.externalMessageId, d.direction, d.delivery ?? null]),
    [
      ['zendesk:comment:1', 'inbound', null],
      ['zendesk:comment:2', 'outbound', 'sent'],
      ['zendesk:comment:3', 'outbound', 'sent'],
      ['zendesk:comment:4', 'outbound', 'sent'],
      ['zendesk:comment:5', 'internal', null],
      ['zendesk:comment:6', 'internal', null],
    ],
  );
  const staff = plan.drafts[2];
  assert.equal(staff.authorStaffId, 12);
  const first = plan.drafts[0];
  assert.equal(first.channel, 'zendesk');
  assert.equal(first.supportItemId, 7);
  assert.equal(first.externalConversationId, '48120');
  assert.equal(first.subject, 'Broken remote');
  assert.deepEqual(first.requester, { name: 'Jo', email: 'jo@example.com' });
  assert.equal(first.source, 'zendesk_sync');
});

test('ordering: oldest first by created_at, comment id breaks ties', () => {
  const plan = planMirrorIngest({
    orgId: ORG,
    supportItemId: 7,
    mode: 'backfill',
    existingMessageIds: new Set(),
    mirror: mirror([
      comment(30, { created_at: '2026-10-02T00:00:00Z' }),
      comment(12, { created_at: '2026-10-01T00:00:00Z' }),
      comment(11, { created_at: '2026-10-01T00:00:00Z' }),
    ]),
  });
  assert.deepEqual(plan.drafts.map((d) => d.externalMessageId), [11, 12, 30].map(zendeskCommentMessageId));
  assert.ok(plan.drafts.every((d) => d.mode === 'backfill' && d.source === 'zendesk_import'));
});

test('idempotency: stored comments and empty bodies are skipped, never re-drafted', () => {
  const plan = planMirrorIngest({
    orgId: ORG,
    supportItemId: 7,
    mode: 'live',
    existingMessageIds: new Set([zendeskCommentMessageId(1)]),
    mirror: mirror([comment(1, {}), comment(2, { body: '   ', plain_body: '' }), comment(3, { plain_body: 'plain wins' })]),
  });
  assert.equal(plan.skipped, 2);
  assert.deepEqual(plan.drafts.map((d) => [d.externalMessageId, d.body]), [['zendesk:comment:3', 'plain wins']]);
});

test('live boundary: history at or before liveAfter is backfill; only newer comments go live', () => {
  const plan = planMirrorIngest({
    orgId: ORG,
    supportItemId: 7,
    mode: 'live',
    liveAfter: '2026-10-01T12:00:00.000Z',
    existingMessageIds: new Set(),
    mirror: mirror([
      comment(1, { created_at: '2026-10-01T11:00:00Z' }),
      comment(2, { created_at: '2026-10-01T12:00:00Z' }),
      comment(3, { created_at: '2026-10-01T12:00:01Z' }),
    ]),
  });
  assert.deepEqual(plan.drafts.map((d) => d.mode), ['backfill', 'backfill', 'live']);
  assert.deepEqual(plan.drafts.map((d) => d.source), ['zendesk_import', 'zendesk_import', 'zendesk_sync']);
});

test("the provider's status (solved) is not carried into any draft", () => {
  const plan = planMirrorIngest({
    orgId: ORG,
    supportItemId: 7,
    mode: 'live',
    existingMessageIds: new Set(),
    mirror: mirror([comment(1, {})]),
  });
  assert.ok(!JSON.stringify(plan.drafts).includes('solved'));
});
