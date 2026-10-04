'use client';

/**
 * The task's ticket, IN LINE (owner 2026-10-03: "you must be able to see the ticket in line").
 * A Messages-style conversation inside the record's scroll: oldest → newest, the newest three
 * shown, earlier ones one tap away. Customer messages sit left on the sunken plane; ours sit
 * right on the info tint; internal notes wear a lock and the warning tint. No field labels —
 * the author and the time lead each message. Replying stays on the ticket's own screen (one
 * composer, `/m/t/<n>`), reached from the row under the thread.
 *
 * Because the thread is here, the task timeline drops ticket comments (one fact, one place).
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { TicketStatusPill } from '@/design-system/components/TicketStatusPill';
import { useTicketComments, useZendeskUsers } from '@/hooks/useZendeskQueries';
import { taskBoardAgo } from '@/lib/task-board/task-board-model';
import { cn } from '@/utils/_cn';

const SHOWN = 3;

export function TaskTicketInline({
  ticketNumber,
  status,
  nowMs,
}: {
  ticketNumber: number;
  /** `support_tickets.status_cache`. */
  status: string | null;
  nowMs: number;
}) {
  const { data, isLoading, error } = useTicketComments(ticketNumber);
  const comments = useMemo(
    () => [...(data?.comments ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
    [data?.comments],
  );
  const authorIds = useMemo(() => [...new Set(comments.map((c) => c.author_id))], [comments]);
  const users = useZendeskUsers(authorIds);
  const people = useMemo(() => {
    const byId = new Map<number, { name: string; agent: boolean }>();
    for (const u of users.data ?? []) byId.set(u.id, { name: u.name, agent: u.role !== 'end-user' });
    return byId;
  }, [users.data]);
  const [showAll, setShowAll] = useState(false);
  const hidden = showAll ? 0 : Math.max(0, comments.length - SHOWN);
  const visible = comments.slice(hidden);

  return (
    <section aria-label={`Ticket #${ticketNumber}`} className="flex flex-col gap-2 pt-3" data-testid="task-ticket-inline">
      {isLoading ? <p className="text-role-caption text-text-muted">Loading the ticket…</p> : null}
      {error ? (
        <p role="alert" className="text-role-caption text-text-danger">
          {error.message}
        </p>
      ) : null}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="min-h-11 self-center text-role-caption font-semibold text-text-info"
        >
          Show {hidden} earlier {hidden === 1 ? 'message' : 'messages'}
        </button>
      ) : null}
      <ol className="flex flex-col gap-2">
        {visible.map((comment) => {
          const who = people.get(comment.author_id);
          const ours = who?.agent ?? false;
          const internal = !comment.public;
          return (
            <li key={comment.id} className={cn('flex flex-col gap-1', ours ? 'items-end pl-8' : 'items-start pr-8')}>
              <span className="flex items-center gap-1 px-1 text-role-caption text-text-muted">
                {internal ? <Lock aria-label="Internal note" className="size-3.5" /> : null}
                <span className="font-semibold text-text-default">{who?.name ?? 'Customer'}</span>
                <span className="tabular-nums">{taskBoardAgo(Date.parse(comment.created_at), nowMs)}</span>
              </span>
              <p
                className={cn(
                  'whitespace-pre-wrap break-words rounded-mode-control px-3 py-2 text-role-data text-text-default',
                  internal ? 'bg-fill-warning/15' : ours ? 'bg-fill-info/15' : 'bg-surface-sunken',
                )}
              >
                {comment.body.trim()}
              </p>
            </li>
          );
        })}
      </ol>
      <Link
        href={`/m/t/${ticketNumber}`}
        className="flex min-h-11 items-center gap-2 rounded-mode-control px-1 text-role-data text-text-default active:bg-surface-hover"
        data-testid="task-ticket-open"
      >
        <span className="font-semibold tabular-nums">#{ticketNumber}</span>
        <TicketStatusPill status={status} size="md" />
        <span className="ml-auto text-role-caption text-text-info">Reply</span>
        <ChevronRight aria-hidden className="size-4 text-text-muted" />
      </Link>
    </section>
  );
}
