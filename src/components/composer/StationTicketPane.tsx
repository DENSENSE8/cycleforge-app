'use client';

/** Linked ticket thread, or the same thread chrome filled from the composer draft. */

import { useMemo } from 'react';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ZendeskComment, ZendeskTicket } from '@/lib/zendesk';
import type { WorkspaceTicketDraftModel } from '@/components/receiving/workspace/line-edit/hooks/useWorkspaceTicketDraft';
import { cn } from '@/utils/_cn';
import { useTicketThreadActivation } from './useTicketThreadActivation';

function draftTicket(draft: WorkspaceTicketDraftModel): {
  ticket: ZendeskTicket;
  comments: ZendeskComment[];
} {
  const now = new Date().toISOString();
  const subject = draft.claim.subject.trim() || 'New support ticket';
  const body = draft.claim.body.trim() || 'Write in the Ticket composer below.';
  const cc = [...draft.ccs, draft.ccDraft.trim()].filter(Boolean).join(', ');
  const commentBody = cc ? `${body}\n\nCC: ${cc}` : body;
  return {
    ticket: {
      id: 0,
      subject,
      description: body,
      status: 'new',
      priority: 'normal',
      created_at: now,
      updated_at: now,
    },
    comments: [
      {
        id: 1,
        author_id: 0,
        author_name: 'You',
        body: commentBody,
        public: draft.isPublic,
        created_at: now,
      },
    ],
  };
}

export function StationTicketPane({
  row,
  ticketId,
  draft,
  className,
}: {
  row: ReceivingLineRow;
  ticketId: number | null | undefined;
  draft: WorkspaceTicketDraftModel;
  className?: string;
}) {
  const hasTicket = ticketId != null && ticketId > 0;
  const onThreadActivate = useTicketThreadActivation(hasTicket);
  const preview = useMemo(() => (hasTicket ? null : draftTicket(draft)), [draft, hasTicket]);

  return (
    <div
      onClick={onThreadActivate}
      className={cn('flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-surface-card', className)}
      data-testid="station-ticket-pane"
      data-has-ticket={hasTicket ? '1' : '0'}
    >
      <SupportTicketDetail
        ticketId={hasTicket ? ticketId : 0}
        receivingId={row.receiving_id ?? undefined}
        embedded
        hideRequesterBand={false}
        mergeFloorTimeline={false}
        composerPlacement="host"
        hideLinkedContext={!hasTicket}
        preview={preview}
      />
    </div>
  );
}
