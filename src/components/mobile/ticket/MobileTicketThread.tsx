'use client';

/**
 * The phone face of one helpdesk ticket — `/m/t/[ticketId]`.
 *
 * THE MOBILE SoT for the reply verb (SURFACE_LAW §1: every operator verb is
 * completable on `/m` first). A checklist row that carries a ticket link is a
 * job with a conversation attached, and until this screen existed the phone
 * could show the operator that a ticket was owed and then had nowhere to send
 * them — the row's ticket glyph was a MARK precisely because no door existed.
 *
 * A PAGE, not a `BottomSheet`, and the two reasons are the same reason: the
 * on-screen keyboard. A sheet with a focused textarea keeps ~40% of a 390×844
 * screen for the thread the operator is answering, and a thread is exactly what
 * you must re-read while typing. A page also gives the ticket a URL, so a lead
 * can send "look at ticket 48120" and land a thumb on the answer.
 *
 * ONE JOB: read this thread, answer it. No assignment editor, no status
 * change, no photo attach — the desk console keeps those, and each is its own
 * verb with its own destination (SURFACE_LAW R1). The stream face is the house
 * {@link ConversationMessageCard}; the mouth is {@link MobileTicketReplyDock},
 * chrome over the shared composer waist.
 *
 * Boundary: platform layer + `src/lib` + `src/hooks` only. The desk's
 * `MergedRecordStream` and `TicketComposer` are `src/components/**` feature
 * dirs `/m` may not import (ARCHITECTURE.md rule 2); what they SHARE with this
 * file — the message card, the markdown renderer, the author resolver, the
 * composer behaviour — already lives in the design system and in `lib`.
 */

import { useEffect, useMemo, useRef } from 'react';
import { IdentityMark } from '@/components/identity/IdentityMark';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import {
  ConversationMessageCard,
  CONVERSATION_MARK_BOX,
  CONVERSATION_MARK_PLACEHOLDER,
  CONVERSATION_STREAM,
} from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { isNotConfigured, useTicketComments, useZendeskTicket } from '@/hooks/useZendeskQueries';
import { renderBlockMarkdown } from '@/lib/support/markdown';
import { initials, requesterFrom, resolveAuthor } from '@/lib/support/support-chat-utils';
import type { ZendeskAgent, ZendeskUser } from '@/lib/zendesk';
import { cn } from '@/utils/_cn';
import { MobileTicketReplyDock } from './MobileTicketReplyDock';

/**
 * The comments route already resolves author identity server-side
 * (`enrichCommentAuthors` → `author_name` / `author_photo`), so the phone hands
 * `resolveAuthor` empty rosters and still never paints a bare "User <id>".
 * Fetching an agent roster here to re-derive names the payload already carries
 * would be a second request for an answer we hold.
 */
const NO_AGENTS: Map<number, ZendeskAgent> = new Map();
const NO_USERS: Map<number, ZendeskUser> = new Map();

export function MobileTicketThread({ ticketId }: { ticketId: number | null }) {
  const { has, isLoaded } = useAuth();
  /**
   * The same permission the read and write routes gate on
   * (`integrations.zendesk`). Gating the SURFACE on it means a staffer who
   * cannot post never reaches a screen whose only verb 403s — the registry's
   * rule that an absent door beats one that fails on press.
   */
  const canRead = !isLoaded || has('integrations.zendesk');
  const liveId = canRead ? ticketId : null;

  const ticket = useZendeskTicket(liveId);
  const comments = useTicketComments(liveId);

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
      <MobileDetailTopBar
        subtitle={ticketId != null ? `Ticket #${ticketId}` : 'Ticket'}
        title={subject || (ticket.isLoading ? 'Loading…' : 'Untitled ticket')}
        right={
          status ? (
            <span className="text-role-micro uppercase tracking-wide text-text-soft">{status}</span>
          ) : null
        }
      />

      {/*
       * The stream hugs the COMPOSER, not the top bar: `mt-auto` on the inner
       * column pushes a short thread down so the newest message sits where the
       * thumb and the reply field already are. A two-comment ticket otherwise
       * floats at the top of an 844px screen with 500px of dead air between the
       * question and the answer box. `mt-auto` and not `justify-end`, because
       * `justify-end` on a scroll port clips the first message out of reach
       * once the thread grows past one screen.
       */}
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
            {rows.map(({ comment, author }) => (
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
                {renderBlockMarkdown(comment.body)}
              </ConversationMessageCard>
            ))}
            <div ref={streamEnd} />
          </div>
        )}
      </div>

      {canRead && ticketId != null ? (
        <MobileTicketReplyDock
          ticketId={ticketId}
          onSent={() => streamEnd.current?.scrollIntoView({ block: 'end' })}
        />
      ) : null}
    </div>
  );
}
