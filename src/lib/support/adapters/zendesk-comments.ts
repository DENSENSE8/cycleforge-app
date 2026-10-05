/**
 * Mirrored Zendesk comments → SupportMessageDraft (pure mapping). The mirror
 * bridge (conversation/mirror-bridge) reads the LOCAL mirror and feeds these
 * drafts to `ingestSupportMessage`:
 *
 *   customer public comment  → inbound
 *   agent / staff public     → outbound, delivery 'sent'
 *   private note, or a system author (id ≤ 0: triggers, automations) → internal
 *
 * The customer-vs-agent rule is the drafter's (`isCustomerComment`).
 */
import type { ZendeskComment } from '@/lib/zendesk';
import type { TicketMirror } from '@/lib/support/ticket-mirror';
import { isCustomerComment } from '@/lib/support/support-thread';
import type { OrgId } from '@/lib/tenancy/constants';
import type { SupportIngestMode, SupportMessageDraft } from '@/lib/support/conversation/ingest-types';

/** The idempotency key a Zendesk comment carries in thread_messages. */
export function zendeskCommentMessageId(commentId: number | string): string {
  return `zendesk:comment:${commentId}`;
}

/** A mirrored comment after read-time author enrichment (readTicketMirror). */
type EnrichedComment = ZendeskComment & {
  plain_body?: string | null;
  author_name?: string;
  author_is_agent?: boolean;
  author_staff_id?: number | null;
};

export interface MirrorIngestPlanInput {
  orgId: OrgId;
  supportItemId: number;
  mirror: Pick<TicketMirror, 'ticket' | 'comments' | 'agents' | 'requester'>;
  mode: SupportIngestMode;
  /** Live mode only: comments at or before this instant ingest as backfill (history never re-alerts). */
  liveAfter?: string | null;
  /** external_message_id values already stored for this org + provider. */
  existingMessageIds: ReadonlySet<string>;
}

/** The drafts to ingest, oldest first, and how many comments were skipped (already stored, or empty). */
export function planMirrorIngest(input: MirrorIngestPlanInput): {
  drafts: SupportMessageDraft[];
  skipped: number;
} {
  const ticket = input.mirror.ticket;
  const agentIds = new Set(input.mirror.agents.map((a) => Number(a.id)));
  const requester = input.mirror.requester
    ? { name: input.mirror.requester.name, email: input.mirror.requester.email }
    : null;
  const ordered = [...(input.mirror.comments as EnrichedComment[])].sort((a, b) => {
    const at = Date.parse(a.created_at);
    const bt = Date.parse(b.created_at);
    return at !== bt && Number.isFinite(at) && Number.isFinite(bt) ? at - bt : Number(a.id) - Number(b.id);
  });
  const liveAfterMs = input.liveAfter ? Date.parse(input.liveAfter) : Number.NaN;

  const drafts: SupportMessageDraft[] = [];
  let skipped = 0;
  for (const c of ordered) {
    const externalMessageId = zendeskCommentMessageId(c.id);
    const body = (c.plain_body ?? '').trim() || (c.body ?? '').trim();
    if (!body || input.existingMessageIds.has(externalMessageId)) {
      skipped += 1;
      continue;
    }
    const system = Number(c.author_id) <= 0;
    const direction = !c.public || system ? 'internal' : isCustomerComment(c, agentIds) ? 'inbound' : 'outbound';
    const mode: SupportIngestMode =
      input.mode === 'live' && Number.isFinite(liveAfterMs) && !(Date.parse(c.created_at) > liveAfterMs)
        ? 'backfill'
        : input.mode;
    drafts.push({
      orgId: input.orgId,
      source: mode === 'backfill' ? 'zendesk_import' : 'zendesk_sync',
      supportItemId: input.supportItemId,
      channel: 'zendesk',
      externalConversationId: String(ticket.id),
      externalMessageId,
      direction,
      body,
      occurredAt: c.created_at ?? null,
      authorStaffId: direction === 'inbound' ? null : (c.author_staff_id ?? null),
      authorLabel: c.author_name ?? null,
      requester,
      subject: ticket.subject?.trim() || null,
      ...(direction === 'outbound' ? { delivery: 'sent' as const } : {}),
      mode,
    });
  }
  return { drafts, skipped };
}
