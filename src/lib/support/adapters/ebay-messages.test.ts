import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrgId } from '@/lib/tenancy/constants';
import type { IngestSupportMessageResult, SupportMessageDraft } from '@/lib/support/conversation/ingest-types';
import {
  ebayMessageExternalId,
  mapEbayConversation,
  pollEbaySupportMessages,
  type EbayConversationMessage,
  type EbayMessagesPollDeps,
  type EbayUnreadConversation,
} from './ebay-messages';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

const conversation = (over: Partial<EbayUnreadConversation> = {}): EbayUnreadConversation => ({
  conversationId: 'C-1',
  subject: 'Question about item',
  unreadCount: 1,
  latestRecipientUsername: 'usav_store',
  referenceId: '296543218877',
  referenceType: 'LISTING',
  conversationType: 'FROM_MEMBERS',
  ...over,
});

const msg = (id: string, from: string, to: string, at: string, body = `text ${id}`): EbayConversationMessage => ({
  messageId: id,
  body,
  subject: '',
  senderUsername: from,
  recipientUsername: to,
  createdDate: at,
});

const THREAD = [
  msg('m3', 'buyer_jo', 'usav_store', '2026-10-03T00:00:00Z'),
  msg('m1', 'buyer_jo', 'usav_store', '2026-10-01T00:00:00Z'),
  msg('m2', 'USAV_Store', 'buyer_jo', '2026-10-02T00:00:00Z'),
];

test('direction: the unread recipient is the seller; their messages are outbound sent, the buyer’s inbound', () => {
  const { drafts } = mapEbayConversation({
    orgId: ORG,
    accountName: 'usav-main',
    conversation: conversation(),
    messages: THREAD,
    existingMessageIds: new Set(),
  });
  assert.deepEqual(
    drafts.map((d) => [d.externalMessageId, d.direction, d.delivery ?? null]),
    [
      ['ebay:message:m1', 'inbound', null],
      ['ebay:message:m2', 'outbound', 'sent'],
      ['ebay:message:m3', 'inbound', null],
    ],
  );
  for (const d of drafts) {
    assert.equal(d.channel, 'ebay');
    assert.equal(d.externalConversationId, 'C-1');
    assert.deepEqual(d.requester, { handle: 'buyer_jo' });
    assert.equal(d.accountLabel, 'usav-main');
    assert.equal(d.subject, 'Question about item');
  }
});

test('first import: read history is backfill, only the unread tail is live', () => {
  const { drafts } = mapEbayConversation({
    orgId: ORG,
    accountName: 'usav-main',
    conversation: conversation({ unreadCount: 1 }),
    messages: THREAD,
    existingMessageIds: new Set(),
  });
  assert.deepEqual(drafts.map((d) => d.mode), ['backfill', 'backfill', 'live']);
});

test('known conversation: stored messages are skipped and every new one is live', () => {
  const { drafts, skipped } = mapEbayConversation({
    orgId: ORG,
    accountName: 'usav-main',
    conversation: conversation(),
    messages: THREAD,
    existingMessageIds: new Set([ebayMessageExternalId('m1'), ebayMessageExternalId('m2')]),
  });
  assert.equal(skipped, 2);
  assert.deepEqual(drafts.map((d) => [d.externalMessageId, d.mode]), [['ebay:message:m3', 'live']]);
});

test('eBay system notices and third-party messages are not customer conversation', () => {
  assert.deepEqual(
    mapEbayConversation({
      orgId: ORG,
      accountName: 'usav-main',
      conversation: conversation({ conversationType: 'FROM_EBAY' }),
      messages: THREAD,
      existingMessageIds: new Set(),
    }).drafts,
    [],
  );
  const { drafts, skipped } = mapEbayConversation({
    orgId: ORG,
    accountName: 'usav-main',
    conversation: conversation(),
    messages: [msg('x', 'someone', 'else', '2026-10-01T00:00:00Z')],
    existingMessageIds: new Set(),
  });
  assert.deepEqual(drafts, []);
  assert.equal(skipped, 1);
});

function fakeDeps(over: Partial<EbayMessagesPollDeps> = {}) {
  const calls: string[] = [];
  const ingested: SupportMessageDraft[] = [];
  const deps: EbayMessagesPollDeps = {
    hasAppCredentials: async () => true,
    sellerAccounts: async () => ['usav-main'],
    unreadConversations: async () => {
      calls.push('unread');
      return [conversation({ referenceType: 'ORDER', referenceId: '16-14873-30704' }), conversation({ conversationId: 'SYS', conversationType: 'FROM_EBAY' })];
    },
    conversationMessages: async (_o, _a, id) => {
      calls.push(`messages:${id}`);
      return THREAD;
    },
    existingMessageIds: async () => new Set(),
    orderForReference: async (_o, ref) => (ref === '16-14873-30704' ? 42 : null),
    ingest: async (draft): Promise<IngestSupportMessageResult> => {
      ingested.push(draft);
      return {
        ok: true,
        supportItemId: 1,
        threadId: 1,
        messageId: ingested.length,
        taskId: null,
        createdItem: ingested.length === 1,
        createdTask: false,
        reopened: false,
        idempotent: false,
        alertedStaffIds: [],
        draftId: null,
      };
    },
    ...over,
  };
  return { deps, calls, ingested };
}

test('poll: an org without eBay app credentials makes no provider call', async () => {
  const { deps, calls } = fakeDeps({ hasAppCredentials: async () => false });
  const res = await pollEbaySupportMessages(ORG, {}, deps);
  assert.deepEqual(res, { accounts: 0, conversations: 0, ingested: 0, skipped: 0, errors: 0 });
  assert.deepEqual(calls, []);
});

test('poll: ingests oldest-first, skips FROM_EBAY without fetching it, links the exact ORDER reference', async () => {
  const { deps, calls, ingested } = fakeDeps();
  const res = await pollEbaySupportMessages(ORG, {}, deps);
  assert.deepEqual(calls, ['unread', 'messages:C-1']);
  assert.equal(res.ingested, 3);
  assert.equal(res.conversations, 1);
  assert.deepEqual(ingested.map((d) => d.externalMessageId), ['ebay:message:m1', 'ebay:message:m2', 'ebay:message:m3']);
  assert.deepEqual(ingested[0].orderLinks, [{ orderId: 42, primary: true, externalReference: '16-14873-30704' }]);
});

test('poll: a refused ingest counts an error and the next conversation still runs', async () => {
  const { deps } = fakeDeps({
    unreadConversations: async () => [conversation({ conversationId: 'A' }), conversation({ conversationId: 'B' })],
    ingest: async (draft) =>
      draft.externalConversationId === 'A'
        ? { ok: false, status: 422, error: 'nope' }
        : { ok: true, supportItemId: 2, threadId: 2, messageId: 1, taskId: null, createdItem: false, createdTask: false, reopened: false, idempotent: true, alertedStaffIds: [], draftId: null },
  });
  const res = await pollEbaySupportMessages(ORG, {}, deps);
  assert.equal(res.errors, 1);
  assert.equal(res.skipped, 3, 'idempotent ingests count as skipped');
});
