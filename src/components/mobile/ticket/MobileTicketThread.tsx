'use client';

/** The phone face of one helpdesk ticket — `/m/t/[ticketId]`. */

import { useEffect, useMemo, useRef } from 'react';
import { IdentityMark } from '@/components/identity/IdentityMark';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import {
  ConversationMessageCard,
  CONVERSATION_MARK_BOX,
  CONVERSATION_MARK_PLACEHOLDER,
  CONVERSATION_STREAM,
} from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { isNotConfigured, useTicketComments, useZendeskTicket } from '@/hooks/useZendeskQueries';
import { renderBlockMarkdown } from '@/lib/support/markdown';
import {
  ticketItemsForComment,
  type SupportProductFace,
  type SupportTicketItem,
} from '@/lib/support/ticket-items-shared';
import { useSupportTicketItems } from '@/hooks/useSupportTicketItems';
import { TicketProductCard } from '@/components/ui/TicketProductCard';
import { SentToCustomerStrip } from '@/components/ui/SentToCustomerStrip';
import { initials, requesterFrom, resolveAuthor } from '@/lib/support/support-chat-utils';
import type { ZendeskAgent, ZendeskUser } from '@/lib/zendesk';
import { cn } from '@/utils/_cn';
import type { TicketThreadHandoff } from '@/lib/composer/ticket-thread-handoff';
import { MobileTicketReplyDock } from './MobileTicketReplyDock';

/** The comments route already resolves author identity server-side (the ticket mirror read → `author_name` / `author_photo`), so the phone… */
const NO_AGENTS: Map<number, ZendeskAgent> = new Map();
const NO_USERS: Map<number, ZendeskUser> = new Map();
const NO_TICKET_ITEMS: SupportTicketItem[] = [];

/** Phone: a product card is a link to the phone product page — no desk peek here. */
function phoneProductHref(face: SupportProductFace): string {
  return `/m/products/${encodeURIComponent(face.sku)}`;
}

export function MobileTicketThread({
  ticketId,
  handoff,
  backHref,
}: {
  ticketId: number | null;
  /** Prepared reply (`?draft=` / `?photos=` / `?visibility=`); editable, never auto-sent. */
  handoff?: TicketThreadHandoff;
  /** Tickets opened from a record are a child page, so they use Back, not X. */
  backHref?: string | null;
}) {
  const { has, isLoaded } = useAuth();
  /** The same permission the read and write routes gate on (`integrations.zendesk`). */
  const canRead = !isLoaded || has('integrations.zendesk');
  const liveId = canRead ? ticketId : null;

  const ticket = useZendeskTicket(liveId);
  const comments = useTicketComments(liveId);
  // One read of what was sent on this ticket for the whole thread (P7).
  const { data: ticketItems = NO_TICKET_ITEMS } = useSupportTicketItems(liveId);

  const requester = ticket.data ? requesterFrom(ticket.data) : { name: null, email: null };
  const rows = useMemo(() => {
    const list = comments.data?.comments ?? [];
    return list.map((comment) => ({
      comment,
      author: resolveAuthor(comment, {
        agentsById: NO_AGENTS,
        usersById: NO_USERS,
        requesterId: ticket.data?.requester_id,
        requesterName: requester.name,
        requesterEmail: requester.email,
      }),
    }));
  }, [comments.data?.comments, ticket.data?.requester_id, requester.name, requester.email]);

  /**
   * Park at the newest message. A helpdesk thread is read from the bottom —
   * the unanswered comment is the last one — and a phone opening at the top of
   * a 40-comment ticket makes the operator scroll to find the question.
   */
  const streamEnd = useRef<HTMLDivElement | null>(null);
  const count = rows.length;
  useEffect(() => {
    if (count > 0) streamEnd.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  const subject = ticket.data?.subject?.trim();
  const status = typeof ticket.data?.status === 'string' ? ticket.data.status : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card">
      <MobileV2DetailTopBar
        subtitle={ticketId != null ? `Ticket #${ticketId}` : 'Ticket'}
        title={subject || (ticket.isLoading ? 'Loading…' : 'Untitled ticket')}
        backHref={backHref ?? undefined}
        right={
          status ? (
            <span className="text-role-micro text-text-soft">{status}</span>
          ) : null
        }
      />
      {canRead && ticketId != null ? (
        <SentToCustomerStrip
          ticketId={ticketId}
          productHref={phoneProductHref}
          touch
          className="shrink-0 border-b border-border-hairline px-4 py-2.5"
        />
      ) : null}

      {/* The stream hugs the COMPOSER, not the top bar: */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain py-3">
        {!canRead ? (
          <p className="px-4 text-role-caption text-text-muted">
            You do not have access to helpdesk tickets.
          </p>
        ) : ticketId == null ? (
          <p role="alert" className="px-4 text-role-caption text-text-muted">
            That is not a ticket number.
          </p>
        ) : comments.isLoading ? (
          <p className="px-4 text-role-caption text-text-muted">Loading the conversation…</p>
        ) : comments.isError ? (
          <p role="alert" className="px-4 text-role-caption text-text-muted">
            {isNotConfigured(comments.error)
              ? 'The helpdesk is not connected.'
              : 'Could not load this ticket.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 text-role-caption text-text-muted">No messages on this ticket yet.</p>
        ) : (
          <div className={cn(CONVERSATION_STREAM, 'mt-auto')}>
            {rows.map(({ comment, author }) => {
              // Optimistic echoes carry negative temp ids and raw tokens; only a
              // mirrored comment binds log rows by its helpdesk id.
              const { body, items } = ticketItemsForComment(
                comment.body,
                comment.id > 0 ? comment.id : null,
                ticketItems,
              );
              return (
                <ConversationMessageCard
                  key={comment.id}
                  internal={comment.public === false}
                  mark={
                    <div className={CONVERSATION_MARK_BOX}>
                      <IdentityMark
                        initials={initials(author.name)}
                        src={author.photo}
                        size="sm"
                        ring={false}
                        alt={author.name}
                        className={CONVERSATION_MARK_PLACEHOLDER}
                      />
                    </div>
                  }
                  author={author.name}
                  at={comment.created_at}
                >
                  {renderBlockMarkdown(body, {
                    renderProduct: (ref, key) => (
                      <TicketProductCard key={key} {...ref} href={phoneProductHref} />
                    ),
                  })}
                  {items.map((it) => (
                    <TicketProductCard
                      key={it.id}
                      skuCatalogId={it.product.skuCatalogId}
                      role={it.role}
                      qty={it.qty}
                      product={it.product}
                      href={phoneProductHref}
                    />
                  ))}
                </ConversationMessageCard>
              );
            })}
            <div ref={streamEnd} />
          </div>
        )}
      </div>

      {canRead && ticketId != null ? (
        <MobileTicketReplyDock
          ticketId={ticketId}
          handoff={handoff}
          onSent={() => streamEnd.current?.scrollIntoView({ block: 'end' })}
        />
      ) : null}
    </div>
  );
}
