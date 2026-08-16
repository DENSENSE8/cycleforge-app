'use client';

import type { ZendeskTicket } from '@/lib/zendesk';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { openHelpdeskTicketUrl } from '@/lib/desktop/desktop-host';
import { useCapabilityProviderLabel } from '@/hooks/useCapabilityProviderLabel';
import { ChevronLeft, ExternalLink, Link2, Package } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import {
  ConversationHeaderActionButton,
} from '@/design-system/primitives';
import {
  CONVERSATION_HEADER_ACTION_BTN,
  CONVERSATION_HEADER_ACTION_GLYPH,
} from '@/design-system/primitives/conversation-chrome';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { SupportDetailsStack } from './SupportDetailsStack';
import { TicketSubjectField } from './TicketSubjectField';
import { initials, requesterFrom } from './support-chat-utils';

/**
 * Ticket identity band for hosts that have no pane header of their own — the
 * requester, the editable subject, and the icon actions.
 *
 * **The Zendesk field band is gone (2026-08-02).** It carried four dropdowns —
 * status, priority, helpdesk assignee, our staff assignment — in a wrapping row
 * under the subject, and it was the loudest thing on a surface whose job is
 * reading a conversation. Status and priority now live where the operator
 * already looks for them:
 *
 *  - `/support` — the pane header's identity row ({@link SupportTicketIdentity}),
 *    which is also where the status was already being told, quietly, by an 8px
 *    dot. One home, real weight.
 *  - every other host (Unbox ticket push, the Links rail's Customer segment) —
 *    the {@link SupportDetailsStack} popover this header already mounts, which
 *    is the secondary-detail surface those hosts have.
 *
 * Assignment demoted to the rail's Connections display on `/support`, and to
 * that same popover elsewhere.
 *
 * When a host hides BOTH the requester band and the title there is nothing left
 * to draw, and this renders `null` rather than an empty bordered strip — that is
 * `/support`, where the pane header owns identity outright.
 */
export function SupportChatHeader({
  ticket,
  onBack,
  hideExternalLink = false,
  compact = false,
  hideTitle = false,
  hideRequesterBand = false,
  onOpenContext,
  contextOpen = false,
  contextBadge = null,
  ordersHref = null,
}: {
  ticket: ZendeskTicket;
  onBack?: () => void;
  /** When the host already shows the Zendesk link (e.g. SectionTabsSlider rightSlot). */
  hideExternalLink?: boolean;
  /** Station ticket tab — tighter padding + smaller type. */
  compact?: boolean;
  /**
   * Hide the editable subject title — for a host that already renders it.
   * `/support` does: the thread's split header carries the subject in its
   * identity row, and drawing it again one row below was the duplicate this
   * flag exists to remove. Station embeds (Unbox ticket push) have no such
   * header, so they keep the title here.
   */
  hideTitle?: boolean;
  /**
   * Station Ticket tab: drop the avatar/requester identity band (status +
   * assignment row stay). Subject title still renders above that row unless
   * {@link hideTitle}.
   */
  hideRequesterBand?: boolean;
  /** Opens the Support Context slide-over (console host only). */
  onOpenContext?: () => void;
  /** Whether the context slide-over is open (pressed chrome). */
  contextOpen?: boolean;
  /** Short linked-state hint under the Links control (e.g. order last-8 / Unlinked). */
  contextBadge?: string | null;
  /** When the ticket is linked to an order — open Support · Orders for that pk. */
  ordersHref?: string | null;
}) {
  const url = hideExternalLink ? null : zendeskTicketUrl(ticket.id);
  // Runtime provider name so the deep-link reads the org's own helpdesk.
  const { label: helpdeskLabel } = useCapabilityProviderLabel('helpdesk');
  const openLabel = `Open in ${helpdeskLabel}`;
  const requester = requesterFrom(ticket);
  const reqName = requester.name || requester.email || 'Requester';

  // Nothing left to draw — the host owns identity (see the docblock).
  if (hideRequesterBand && hideTitle) return null;

  const titleEditor = hideTitle ? null : (
    <TicketSubjectField
      ticketId={ticket.id}
      subject={ticket.subject}
      compact={compact}
      // With the requester band on, `#id` rides that line instead — one home
      // per fact, per layout.
      trailing={
        hideRequesterBand ? (
          <span className="shrink-0 text-role-micro text-text-faint">#{ticket.id}</span>
        ) : null
      }
    />
  );

  return (
    <div
      className={cn(
        'shrink-0 border-b border-border-hairline bg-surface-card',
        compact ? 'px-2.5 py-1.5' : 'px-5 py-3.5',
      )}
    >
      {hideRequesterBand ? (
        titleEditor ? <div className="mb-1.5">{titleEditor}</div> : null
      ) : (
        <div className="flex items-center gap-2">
          {onBack ? (
            <IconButton
              icon={<ChevronLeft className="h-4 w-4" />}
              onClick={onBack}
              ariaLabel="Back to list"
              className="-ml-1 rounded-md p-1 hover:bg-surface-sunken lg:hidden"
            />
          ) : null}
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full bg-surface-sunken font-semibold text-text-soft',
              compact ? 'h-6 w-6 text-role-micro' : 'h-9 w-9 text-role-caption',
            )}
          >
            {initials(reqName)}
          </span>
          <div className="min-w-0 flex-1">
            {titleEditor}
            <p
              className={cn(
                'truncate text-text-soft',
                hideTitle ? null : 'mt-0.5',
                compact ? 'text-role-micro' : 'text-role-caption',
              )}
            >
              <span className="font-semibold text-text-muted">{reqName}</span>
              {requester.email && requester.name ? (
                <span className="text-text-faint"> · {requester.email}</span>
              ) : null}
              {hideTitle ? null : <span className="text-text-faint"> · #{ticket.id}</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onOpenContext ? (
              <ConversationHeaderActionButton
                label={
                  contextBadge
                    ? `Support context · ${contextBadge}`
                    : 'Support context'
                }
                icon={<Link2 className={CONVERSATION_HEADER_ACTION_GLYPH} />}
                onClick={onOpenContext}
                active={contextOpen}
              />
            ) : null}
            {ordersHref ? (
              <HoverTooltip label="Open linked order" asChild>
                <a
                  href={ordersHref}
                  aria-label="Open linked order"
                  className={CONVERSATION_HEADER_ACTION_BTN}
                >
                  <Package className={CONVERSATION_HEADER_ACTION_GLYPH} />
                </a>
              </HoverTooltip>
            ) : null}
            {/* The editable home for status / priority / assignment on hosts
                with no pane header — see the docblock. */}
            <SupportDetailsStack ticket={ticket} fields="edit" />
            {url ? (
              <ConversationHeaderActionButton
                label={openLabel}
                icon={<ExternalLink className={CONVERSATION_HEADER_ACTION_GLYPH} />}
                onClick={() => {
                  void openHelpdeskTicketUrl(url, { title: openLabel });
                }}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
