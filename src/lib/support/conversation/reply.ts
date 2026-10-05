import 'server-only';

/** Replies on a Support item, bound to Postgres and the item's transport (rules: ./reply-core). */
import {
  markSupportReplySentCore,
  recordSupportReplyCore,
  type MarkSupportReplySentResult,
  type RecordSupportReplyInput,
  type RecordSupportReplyResult,
  type ReplyDeps,
} from './reply-core';
import { supportTransaction } from './store-db';
import {
  applyMarketplacePolicy,
  isHelpdeskConnected,
  resolveSupportTransport,
  sendSupportReplyViaTransport,
} from './transport';

export type { RecordSupportReplyInput, RecordSupportReplyResult, ReplyDeps } from './reply-core';

export const supportReplyDeps: ReplyDeps = {
  transaction: supportTransaction,
  now: Date.now,
  resolveTransport: resolveSupportTransport,
  isHelpdeskConnected,
  applyMarketplacePolicy,
  sendViaTransport: (orgId, args) => sendSupportReplyViaTransport(orgId, args),
};

/** Send / Copy & open / Log one reply — outbound row, answers, follow-up row, next step. */
export function recordSupportReply(
  input: RecordSupportReplyInput,
  deps: ReplyDeps = supportReplyDeps,
): Promise<RecordSupportReplyResult> {
  return recordSupportReplyCore(input, deps);
}

/** Mark sent after Copy & open. */
export function markSupportReplySent(
  input: { orgId: string; supportItemId: number; messageId: number; staffId: number | null },
  deps: Pick<ReplyDeps, 'transaction' | 'now'> = supportReplyDeps,
): Promise<MarkSupportReplySentResult> {
  return markSupportReplySentCore(input, deps);
}
