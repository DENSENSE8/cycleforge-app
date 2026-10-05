/**
 * eBay member messages → the local Support loop. The poll reads each active
 * SELLER account's unread conversations (Commerce Message API, read-only —
 * nothing is marked read), maps every message to a SupportMessageDraft and
 * hands it to `ingestSupportMessage`. Idempotent by external_message_id
 * `ebay:message:<messageId>`; one Support item per eBay conversation
 * (externalConversationId = conversationId).
 *
 * Direction: an unread conversation's latest message was RECEIVED by the
 * account, so its recipient is the seller's eBay username. Messages the seller
 * sent are outbound 'sent' (they went out on eBay); the rest are inbound.
 * eBay system notices (conversationType FROM_EBAY) are not customer
 * conversations and are skipped.
 *
 * Mode: a conversation never stored before imports its read history as
 * backfill and only the unread tail live (one task + alert for what is
 * actually waiting); a known conversation ingests every new message live.
 */
import { EbayClient } from '@/lib/ebay/client';
import { getEbayAppCreds, listActiveEbayAccounts } from '@/lib/ebay/credentials';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { ingestSupportMessage } from '@/lib/support/conversation/ingest';
import type {
  IngestSupportMessageResult,
  SupportMessageDraft,
  SupportOrderLinkInput,
} from '@/lib/support/conversation/ingest-types';

export interface EbayUnreadConversation {
  conversationId: string;
  subject: string;
  unreadCount: number;
  latestRecipientUsername: string;
  referenceId: string;
  referenceType: string;
  conversationType: string;
}

export interface EbayConversationMessage {
  messageId: string;
  body: string;
  subject: string;
  senderUsername: string;
  recipientUsername: string;
  createdDate: string;
}

export function ebayMessageExternalId(messageId: string): string {
  return `ebay:message:${messageId}`;
}

/**
 * Pure: one conversation's messages → drafts, oldest first. Messages already
 * stored, empty, or not between the seller and one other member are skipped.
 */
export function mapEbayConversation(input: {
  orgId: OrgId;
  accountName: string;
  conversation: EbayUnreadConversation;
  messages: ReadonlyArray<EbayConversationMessage>;
  existingMessageIds: ReadonlySet<string>;
  orderLinks?: SupportOrderLinkInput[];
}): { drafts: SupportMessageDraft[]; skipped: number } {
  const { conversation } = input;
  const seller = conversation.latestRecipientUsername.trim().toLowerCase();
  if (conversation.conversationType === 'FROM_EBAY' || !seller || !conversation.conversationId) {
    return { drafts: [], skipped: input.messages.length };
  }

  const ordered = [...input.messages].sort(
    (a, b) => Date.parse(a.createdDate) - Date.parse(b.createdDate) || a.messageId.localeCompare(b.messageId),
  );
  // Known conversation (anything already stored) → everything new is live;
  // first import → only the unread tail is live.
  const known = ordered.some((m) => input.existingMessageIds.has(ebayMessageExternalId(m.messageId)));
  const liveFrom = known ? 0 : Math.max(0, ordered.length - Math.max(1, conversation.unreadCount));

  const drafts: SupportMessageDraft[] = [];
  let skipped = 0;
  ordered.forEach((m, index) => {
    const body = m.body.trim();
    const sender = m.senderUsername.trim().toLowerCase();
    const recipient = m.recipientUsername.trim().toLowerCase();
    const outbound = sender === seller;
    const buyer = outbound ? m.recipientUsername.trim() : m.senderUsername.trim();
    const externalMessageId = ebayMessageExternalId(m.messageId);
    if (
      !m.messageId ||
      !body ||
      input.existingMessageIds.has(externalMessageId) ||
      (!outbound && recipient !== seller) ||
      !buyer
    ) {
      skipped += 1;
      return;
    }
    drafts.push({
      orgId: input.orgId,
      source: 'ebay',
      channel: 'ebay',
      externalConversationId: conversation.conversationId,
      externalMessageId,
      direction: outbound ? 'outbound' : 'inbound',
      body,
      occurredAt: m.createdDate || null,
      authorLabel: outbound ? input.accountName : buyer,
      requester: { handle: buyer },
      subject: m.subject.trim() || conversation.subject.trim() || null,
      accountLabel: input.accountName,
      ...(input.orderLinks?.length ? { orderLinks: input.orderLinks } : {}),
      ...(outbound ? { delivery: 'sent' as const } : {}),
      mode: index >= liveFrom ? 'live' : 'backfill',
    });
  });
  return { drafts, skipped };
}

export interface EbayMessagesPollDeps {
  hasAppCredentials(orgId: OrgId): Promise<boolean>;
  sellerAccounts(orgId: OrgId): Promise<string[]>;
  unreadConversations(orgId: OrgId, accountName: string, limit: number): Promise<EbayUnreadConversation[]>;
  conversationMessages(
    orgId: OrgId,
    accountName: string,
    conversationId: string,
    conversationType: string,
  ): Promise<EbayConversationMessage[]>;
  existingMessageIds(orgId: OrgId, ids: string[]): Promise<Set<string>>;
  /** Exact local order for an eBay ORDER reference (orders.order_id), or null. */
  orderForReference(orgId: OrgId, reference: string): Promise<number | null>;
  ingest(draft: SupportMessageDraft): Promise<IngestSupportMessageResult>;
}

const realDeps: EbayMessagesPollDeps = {
  hasAppCredentials: async (orgId) => (await getEbayAppCreds(orgId)) != null,
  async sellerAccounts(orgId) {
    const accounts = await listActiveEbayAccounts(orgId);
    return accounts.filter((a) => a.accountRole === 'seller').map((a) => a.accountName);
  },
  async unreadConversations(orgId, accountName, limit) {
    const rows = await new EbayClient(accountName, orgId).fetchUnreadMessages(limit);
    return rows.map((r) => ({
      conversationId: String(r.conversationId ?? ''),
      subject: String(r.subject ?? ''),
      unreadCount: Number(r.unreadCount ?? 0),
      latestRecipientUsername: String(r.latestRecipientUsername ?? ''),
      referenceId: String(r.referenceId ?? ''),
      referenceType: String(r.referenceType ?? ''),
      conversationType: String(r.conversationType ?? ''),
    }));
  },
  conversationMessages: (orgId, accountName, conversationId, conversationType) =>
    new EbayClient(accountName, orgId).fetchConversationMessages(conversationId, conversationType),
  async existingMessageIds(orgId, ids) {
    if (ids.length === 0) return new Set();
    const r = await tenantQuery<{ external_message_id: string }>(
      orgId,
      `SELECT external_message_id
         FROM thread_messages
        WHERE organization_id = $1
          AND provider = 'ebay'
          AND external_message_id = ANY($2::text[])`,
      [orgId, ids],
    );
    return new Set(r.rows.map((row) => row.external_message_id));
  },
  async orderForReference(orgId, reference) {
    const r = await tenantQuery<{ id: number }>(
      orgId,
      `SELECT id FROM orders WHERE organization_id = $1 AND order_id = $2 LIMIT 2`,
      [orgId, reference],
    );
    // Exact or nothing: an order number on two rows is not one order.
    return r.rows.length === 1 ? Number(r.rows[0].id) : null;
  },
  ingest: (draft) => ingestSupportMessage(draft),
};

export interface EbayMessagesPollResult {
  accounts: number;
  conversations: number;
  ingested: number;
  skipped: number;
  errors: number;
}

/**
 * Poll ONE org's eBay seller accounts. Orgs without eBay app credentials or a
 * seller account return zeros without a provider call. A failing account or
 * conversation is counted and logged; the rest still ingest.
 */
export async function pollEbaySupportMessages(
  orgId: OrgId,
  opts: { conversationsPerAccount?: number } = {},
  deps: EbayMessagesPollDeps = realDeps,
): Promise<EbayMessagesPollResult> {
  const result: EbayMessagesPollResult = { accounts: 0, conversations: 0, ingested: 0, skipped: 0, errors: 0 };
  if (!(await deps.hasAppCredentials(orgId))) return result;
  const accounts = await deps.sellerAccounts(orgId);
  const limit = Math.min(Math.max(opts.conversationsPerAccount ?? 25, 1), 50);

  for (const accountName of accounts) {
    result.accounts += 1;
    let conversations: EbayUnreadConversation[];
    try {
      conversations = await deps.unreadConversations(orgId, accountName, limit);
    } catch (err) {
      result.errors += 1;
      console.warn('[support.ebay-messages] unread list failed', accountName, err instanceof Error ? err.message : err);
      continue;
    }

    for (const conversation of conversations) {
      if (conversation.conversationType === 'FROM_EBAY') continue;
      result.conversations += 1;
      try {
        const messages = await deps.conversationMessages(
          orgId,
          accountName,
          conversation.conversationId,
          conversation.conversationType,
        );
        const existing = await deps.existingMessageIds(
          orgId,
          messages.map((m) => ebayMessageExternalId(m.messageId)),
        );
        const orderId =
          conversation.referenceType.toUpperCase() === 'ORDER' && conversation.referenceId
            ? await deps.orderForReference(orgId, conversation.referenceId)
            : null;
        const plan = mapEbayConversation({
          orgId,
          accountName,
          conversation,
          messages,
          existingMessageIds: existing,
          orderLinks:
            orderId != null
              ? [{ orderId, primary: true, externalReference: conversation.referenceId }]
              : undefined,
        });
        result.skipped += plan.skipped;
        for (const draft of plan.drafts) {
          const res = await deps.ingest(draft);
          if (!res.ok) throw new Error(`ingest refused ${draft.externalMessageId} (${res.status}): ${res.error}`);
          if (res.idempotent) result.skipped += 1;
          else result.ingested += 1;
        }
      } catch (err) {
        result.errors += 1;
        console.warn(
          '[support.ebay-messages] conversation failed',
          conversation.conversationId,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  return result;
}
