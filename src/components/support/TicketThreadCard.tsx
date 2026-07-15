'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock, Loader2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { formatDateTimePST } from '@/utils/date';
import { renderInlineMarkdown } from '@/lib/support/markdown';
import { ClaimTicketReply } from '@/components/receiving/workspace/claim/components/ClaimTicketReply';
import type { UseClaimTicketReply } from '@/components/receiving/workspace/claim/hooks/useClaimTicketReply';
import type { FiledTicket } from '@/components/receiving/workspace/claim/claim-types';

export const threadKey = (ticketId: number) => ['receiving', 'ticket-thread', ticketId] as const;

export interface ThreadComment {
  id: number;
  body: string;
  public: boolean;
  createdAt: string;
  authorId: number;
}

export interface ThreadResult {
  ticket: {
    id: number;
    subject: string | null;
    status: string;
    priority: string | null;
    url: string | null;
    requesterEmail: string | null;
  };
  comments: ThreadComment[];
}

export function useTicketThread(ticketId: number | null, enabled: boolean = true) {
  return useQuery<ThreadResult, Error>({
    queryKey: threadKey(ticketId ?? 0),
    queryFn: async () => {
      const res = await fetch(`/api/receiving/zendesk-claim/thread?ticketId=${ticketId}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      return {
        ticket: {
          id: data.ticket.id,
          subject: data.ticket.subject ?? null,
          status: String(data.ticket.status ?? ''),
          priority: data.ticket.priority ?? null,
          url: data.ticket.url ?? null,
          requesterEmail: data.ticket.requesterEmail ?? null,
        },
        comments: data.comments,
      } as ThreadResult;
    },
    enabled: enabled && !!ticketId,
    staleTime: 30_000,
    retry: false,
  });
}

export interface TicketThreadCardProps {
  ticketId: number | null;
  replyProps?: {
    reply: UseClaimTicketReply;
    filedTicket: FiledTicket;
    /** Where the send CTA lives — terminal for Claim tab dock. */
    sendPlacement?: 'inline' | 'terminal';
    /** Opens SendPhotoNoteModal locked to this ticket. */
    onAttachPhotos?: () => void;
  };
  className?: string;
}

/**
 * Shared primitive for displaying a Zendesk ticket thread (bubbles) and optionally a composer.
 */
export function TicketThreadCard({ ticketId, replyProps, className }: TicketThreadCardProps) {
  const { data, isLoading, isError, error } = useTicketThread(ticketId, true);

  return (
    <div className={cn('flex flex-col overflow-hidden', className)}>
      <div className="min-h-0 max-h-80 flex-1 overflow-y-auto px-1 py-1">
        {!ticketId ? (
          <p className="py-6 text-center text-sm text-text-faint">No ticket id to look up.</p>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          </div>
        ) : isError ? (
          <p className="rounded-md bg-rose-50 px-2 py-1.5 text-role-caption text-rose-600">
            History unavailable: {error instanceof Error ? error.message : 'request failed'}
          </p>
        ) : !data || data.comments.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-faint">No history yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.comments.map((c) => (
              <li
                key={c.id}
                className={cn(
                  'rounded-lg border px-3 py-2',
                  c.public ? 'border-blue-100 bg-blue-50/60' : 'border-amber-100 bg-amber-50/60',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-role-micro uppercase tracking-wide">
                  <span className={c.public ? 'font-semibold text-blue-600' : 'font-semibold text-amber-600'}>
                    {c.public ? 'Public reply' : 'Internal note'}
                  </span>
                  <span className="flex items-center gap-1 normal-case text-text-faint">
                    <Clock className="h-3 w-3" />
                    {formatDateTimePST(c.createdAt)}
                  </span>
                </div>
                <p className="break-words text-role-data leading-snug text-text-default">
                  {renderInlineMarkdown(c.body)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {replyProps ? (
        <div className="mt-4 border-t border-border-soft pt-4">
          <ClaimTicketReply
            reply={replyProps.reply}
            filedTicket={replyProps.filedTicket}
            requesterEmail={data?.ticket.requesterEmail}
            sendPlacement={replyProps.sendPlacement}
            onAttachPhotos={replyProps.onAttachPhotos}
          />
        </div>
      ) : null}
    </div>
  );
}
