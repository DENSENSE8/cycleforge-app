/**
 * Support transports — how a reply leaves CycleForge. Zendesk-bound items with
 * a connected helpdesk send from here; every other channel is Copy & open
 * (the staffer pastes into the marketplace / mail client, then marks it sent).
 *
 *   resolveSupportTransport   pure — the item's SupportTransportView.
 *   sendSupportReplyViaTransport  the ONLY provider write of the Support loop
 *                             (Zendesk addComment through the helpdesk facade).
 *   applyMarketplacePolicy    re-exported from ./marketplace-policy (client-safe).
 */
import { getHelpdeskProvider, type HelpdeskProvider, type HelpdeskTicket } from '@/lib/integrations/helpdesk';
import { recordHelpdeskCommentStaff } from '@/lib/integrations/helpdesk/comment-staff';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { marketplaceOrderUrl } from '@/utils/order-platform';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { isMarketplaceChannel, MARKETPLACE_MAX_LENGTH } from './marketplace-policy';
import { zendeskCommentMessageId } from '@/lib/support/adapters/zendesk-comments';
import { withMirrorBridgeSuppressed } from './mirror-bridge';
import { SUPPORT_CHANNEL_LABEL, type SupportChannel, type SupportTransportView } from './model';

// Contract path (DRAFTS / CORE import it from here); the pure module is client-safe.
export { applyMarketplacePolicy } from './marketplace-policy';

/** A provider ticket number we can address (digits only). */
function zendeskTicketNumber(externalTicketId: string | null | undefined): number | null {
  const raw = String(externalTicketId ?? '').trim().replace(/^#/, '');
  if (!/^\d{1,15}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * The item's transport. Connected only for a Zendesk-bound item whose org has
 * the helpdesk configured (`helpdeskConfigured`, default true — pass the
 * result of {@link isHelpdeskConnected} when known). Everything else is Copy &
 * open: eBay / Amazon / Ecwid land on the order's admin page (stored
 * `orders.admin_url`, else the URL derived from the order number), email on a
 * mailto: with the subject, Zendesk-without-connection on the agent ticket.
 */
export function resolveSupportTransport(item: {
  channel: SupportChannel;
  externalTicketId: string | null;
  primaryOrderAdminUrl?: string | null;
  requesterEmail?: string | null;
  orderNumber?: string | null;
  subject?: string | null;
  helpdeskConfigured?: boolean;
}): SupportTransportView {
  const { channel } = item;
  const adminUrl = item.primaryOrderAdminUrl?.trim() || null;
  const orderNumber = item.orderNumber?.trim() || null;
  const ticketNumber = zendeskTicketNumber(item.externalTicketId);
  const connected = channel === 'zendesk' && ticketNumber != null && item.helpdeskConfigured !== false;

  let openUrl: string | null = null;
  switch (channel) {
    case 'zendesk':
      openUrl = ticketNumber != null ? zendeskTicketUrl(ticketNumber) : null;
      break;
    case 'ebay':
    case 'amazon':
    case 'ecwid':
      openUrl = adminUrl ?? (orderNumber ? marketplaceOrderUrl(orderNumber, channel) : null);
      break;
    case 'email': {
      const email = item.requesterEmail?.trim();
      if (email) {
        const subject = item.subject?.trim();
        openUrl = `mailto:${encodeURIComponent(email)}${subject ? `?subject=${encodeURIComponent(`Re: ${subject}`)}` : ''}`;
      }
      break;
    }
    default:
      openUrl = null;
  }

  return {
    connected,
    channel,
    label: SUPPORT_CHANNEL_LABEL[channel],
    openUrl,
    marketplacePolicy: isMarketplaceChannel(channel),
    maxLength: MARKETPLACE_MAX_LENGTH[channel] ?? null,
  };
}

/** Local check (vault / connection rows — no provider HTTP): can this org send through its helpdesk? */
export async function isHelpdeskConnected(orgId: OrgId): Promise<boolean> {
  const helpdesk = await getHelpdeskProvider(orgId);
  return helpdesk != null && (await helpdesk.isConfigured());
}

export interface SupportTransportDeps {
  /** The org's configured helpdesk, or null. */
  helpdesk(orgId: OrgId): Promise<HelpdeskProvider | null>;
  /** The comment the send just wrote, read from the LOCAL mirror the write-through refreshed. */
  postedCommentId(args: {
    orgId: OrgId;
    ticketId: number;
    body: string;
    publicReply: boolean;
    sentAfter: Date;
  }): Promise<number | null>;
  recordCommentStaff(args: { orgId: OrgId; ticketId: number; commentId: number; staffId: number }): Promise<void>;
}

const realDeps: SupportTransportDeps = {
  async helpdesk(orgId) {
    const helpdesk = await getHelpdeskProvider(orgId);
    return helpdesk && (await helpdesk.isConfigured()) ? helpdesk : null;
  },
  async postedCommentId({ orgId, ticketId, body, publicReply, sentAfter }) {
    // Body match first, newest first; the window tolerates clock skew between
    // our server and the provider's created_at.
    const r = await tenantQuery<{ external_comment_id: string }>(
      orgId,
      `SELECT c.external_comment_id
         FROM support_ticket_comments c
         JOIN support_tickets st
           ON st.organization_id = c.organization_id
          AND st.id = c.support_ticket_id
        WHERE c.organization_id = $1
          AND st.provider = 'zendesk'
          AND st.external_ticket_id = $2
          AND c.is_public = $4
          AND c.external_created_at >= $5::timestamptz - interval '2 minutes'
        ORDER BY (btrim(COALESCE(NULLIF(c.plain_body, ''), c.body, '')) = btrim($3)) DESC,
                 c.external_created_at DESC, c.external_comment_id DESC
        LIMIT 1`,
      [orgId, String(ticketId), body, publicReply, sentAfter.toISOString()],
    );
    const id = Number(r.rows[0]?.external_comment_id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  },
  recordCommentStaff: (args) => recordHelpdeskCommentStaff(args),
};

/**
 * Post a reply (public) or note (internal) on the item's Zendesk ticket. The
 * write-through re-mirror runs with the mirror bridge suppressed — the caller
 * stores its own outbound row under the returned id. Never invoke against a
 * real provider from an automated test.
 */
export async function sendSupportReplyViaTransport(
  orgId: OrgId,
  args: {
    channel: SupportChannel;
    externalTicketId: string | null;
    body: string;
    publicReply: boolean;
    staffId: number | null;
  },
  deps: SupportTransportDeps = realDeps,
): Promise<{ ok: true; externalMessageId: string | null } | { ok: false; error: string }> {
  if (args.channel !== 'zendesk') {
    return { ok: false, error: `${SUPPORT_CHANNEL_LABEL[args.channel]} cannot send from CycleForge — use Copy & open.` };
  }
  const ticketId = zendeskTicketNumber(args.externalTicketId);
  if (ticketId == null) return { ok: false, error: 'This Support item is not bound to a Zendesk ticket.' };
  const body = args.body.trim();
  if (!body) return { ok: false, error: 'The reply is empty.' };

  const helpdesk = await deps.helpdesk(orgId);
  if (!helpdesk) return { ok: false, error: 'Zendesk is not connected for this organization.' };

  const sentAfter = new Date();
  let ticket: HelpdeskTicket | null;
  try {
    ticket = await withMirrorBridgeSuppressed(() =>
      helpdesk.addComment(ticketId, { body, public: args.publicReply }),
    );
  } catch (err) {
    return { ok: false, error: `Zendesk refused the reply: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!ticket) return { ok: false, error: `Zendesk ticket #${ticketId} no longer exists.` };

  const commentId = await deps.postedCommentId({ orgId, ticketId, body, publicReply: args.publicReply, sentAfter });
  if (commentId != null && args.staffId) {
    await deps.recordCommentStaff({ orgId, ticketId, commentId, staffId: args.staffId });
  }
  return { ok: true, externalMessageId: commentId != null ? zendeskCommentMessageId(commentId) : null };
}
