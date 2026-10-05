import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { TicketMirror } from '@/lib/support/ticket-mirror';
import type { IngestSupportMessageResult, SupportMessageDraft } from './ingest-types';
import {
  mirrorBridgeSuppressed,
  syncSupportThreadAfterMirrorWrite,
  syncSupportThreadFromMirror,
  withMirrorBridgeSuppressed,
  type MirrorBridgeDeps,
} from './mirror-bridge';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const ITEM = 7;

function theMirror(): TicketMirror {
  return {
    supportTicketId: ITEM,
    mirroredAt: '2026-10-04T00:00:00Z',
    ticket: { id: 48120, subject: 'Remote', status: 'solved', priority: null, created_at: '', updated_at: '' },
    comments: [
      { id: 2, author_id: 900, body: 'We will replace it', public: true, created_at: '2026-10-02T00:00:00Z' },
      { id: 1, author_id: 501, body: 'It is broken', public: true, created_at: '2026-10-01T00:00:00Z' },
      { id: 3, author_id: 501, body: 'Thanks, still waiting', public: true, created_at: '2026-10-03T00:00:00Z' },
    ],
    agents: [{ id: 900, name: 'Ana', email: null, role: 'agent', photo: null }],
    requester: { id: 501, name: 'Jo', email: 'jo@example.com' },
    entity: null,
    photos: [],
  };
}

function fake(over: Partial<MirrorBridgeDeps> & { stored?: Set<string>; messageCount?: number; newestAt?: string | null } = {}) {
  const stored = over.stored ?? new Set<string>();
  const ingested: SupportMessageDraft[] = [];
  const deps: MirrorBridgeDeps = {
    readItem: async () => ({ provider: 'zendesk', externalTicketId: '48120' }),
    readMirror: async () => theMirror(),
    readThreadState: async () => ({
      messageCount: over.messageCount ?? stored.size,
      newestMessageAt: over.newestAt ?? null,
      existingMessageIds: new Set(stored),
    }),
    ingest: async (draft): Promise<IngestSupportMessageResult> => {
      ingested.push(draft);
      const idempotent = stored.has(draft.externalMessageId ?? '');
      stored.add(draft.externalMessageId ?? '');
      return {
        ok: true,
        supportItemId: ITEM,
        threadId: 1,
        messageId: idempotent ? null : ingested.length,
        taskId: null,
        createdItem: false,
        createdTask: false,
        reopened: false,
        idempotent,
        alertedStaffIds: [],
        draftId: null,
      };
    },
    ...over,
  };
  return { deps, ingested, stored };
}

test('first import is backfill, oldest first, with the Zendesk ids as idempotency keys', async () => {
  const { deps, ingested } = fake();
  const res = await syncSupportThreadFromMirror(ORG, ITEM, {}, deps);
  assert.deepEqual(res, { ingested: 3, skipped: 0 });
  assert.deepEqual(ingested.map((d) => [d.externalMessageId, d.direction, d.mode]), [
    ['zendesk:comment:1', 'inbound', 'backfill'],
    ['zendesk:comment:2', 'outbound', 'backfill'],
    ['zendesk:comment:3', 'inbound', 'backfill'],
  ]);
  assert.ok(ingested.every((d) => d.supportItemId === ITEM && d.externalConversationId === '48120'));
});

test('re-running is idempotent: stored comments never reach ingest again', async () => {
  const { deps, ingested } = fake();
  await syncSupportThreadFromMirror(ORG, ITEM, {}, deps);
  ingested.length = 0;
  const again = await syncSupportThreadFromMirror(ORG, ITEM, {}, deps);
  assert.deepEqual(again, { ingested: 0, skipped: 3 });
  assert.equal(ingested.length, 0);
});

test('an item with thread messages goes live only for comments newer than its newest message', async () => {
  const { deps, ingested } = fake({
    stored: new Set(['zendesk:comment:1']),
    messageCount: 1,
    newestAt: '2026-10-02T00:00:00.000Z',
  });
  const res = await syncSupportThreadFromMirror(ORG, ITEM, {}, deps);
  assert.deepEqual(res, { ingested: 2, skipped: 1 });
  assert.deepEqual(ingested.map((d) => [d.externalMessageId, d.mode]), [
    ['zendesk:comment:2', 'backfill'],
    ['zendesk:comment:3', 'live'],
  ]);
});

test('an explicit mode wins over the automatic choice', async () => {
  const { deps, ingested } = fake({ messageCount: 5, newestAt: '2026-12-01T00:00:00Z' });
  await syncSupportThreadFromMirror(ORG, ITEM, { mode: 'live' }, deps);
  assert.ok(ingested.every((d) => d.mode === 'live'));
});

test('a race the pre-filter missed is counted skipped (ingest reported idempotent)', async () => {
  const stored = new Set<string>();
  const { deps } = fake({ stored, readThreadState: async () => ({ messageCount: 0, newestMessageAt: null, existingMessageIds: new Set() }) });
  stored.add('zendesk:comment:2');
  assert.deepEqual(await syncSupportThreadFromMirror(ORG, ITEM, {}, deps), { ingested: 2, skipped: 1 });
});

test('non-Zendesk items, unmirrored tickets and a mirror of another item are no-ops', async () => {
  for (const over of [
    { readItem: async () => ({ provider: 'ebay', externalTicketId: 'C-1' }) },
    { readItem: async () => null },
    { readMirror: async () => null },
    { readMirror: async () => ({ ...theMirror(), supportTicketId: 99 }) },
  ] satisfies Array<Partial<MirrorBridgeDeps>>) {
    const { deps, ingested } = fake(over);
    assert.deepEqual(await syncSupportThreadFromMirror(ORG, ITEM, {}, deps), { ingested: 0, skipped: 0 });
    assert.equal(ingested.length, 0);
  }
});

test('a refused message stops the sync loudly (later replies must not answer around it)', async () => {
  const { deps } = fake({ ingest: async () => ({ ok: false, status: 409, error: 'conflict' }) });
  await assert.rejects(() => syncSupportThreadFromMirror(ORG, ITEM, {}, deps), /zendesk:comment:1.*409/);
});

test('the post-mirror hook is switched off inside a send’s write-through', async () => {
  assert.equal(mirrorBridgeSuppressed(), false);
  const seen = await withMirrorBridgeSuppressed(async () => {
    await Promise.resolve();
    // Would hit the DB if not suppressed; returns immediately when it is.
    await syncSupportThreadAfterMirrorWrite(ORG, ITEM);
    return mirrorBridgeSuppressed();
  });
  assert.equal(seen, true);
  assert.equal(mirrorBridgeSuppressed(), false);
});
