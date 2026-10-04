'use client';

/**
 * The Overview's previews (owner 2026-10-03: "Overview should be displaying
 * everything as a simplified, mobile-first, extremely simple, scrollable
 * display … ticket, docs, timeline, media, links, with the slider displaying
 * that information in more details"). Each section shows the newest few
 * facts in the record's one scroll and ends in a blue door to its tab — the
 * tab is the detail, never the only way to see it. No section headings: the
 * content leads (M2); the section's name lives in `aria-label`.
 */

import { useMemo, useState } from 'react';
import { ChevronRight, FileText, Lock } from 'lucide-react';
import { TicketStatusPill } from '@/design-system/components/TicketStatusPill';
import { Button } from '@/design-system/primitives/Button';
import { useTicketComments, useZendeskUsers } from '@/hooks/useZendeskQueries';
import { taskBoardAgo } from '@/lib/task-board/task-board-model';
import { useTaskDocuments } from '@/lib/tasks/use-task-workspace';
import { useTaskTimeline } from '@/lib/tasks/use-task-timeline';
import { cn } from '@/utils/_cn';
import { TimelineRow } from './TaskRailTimeline';

/** Newest messages / events a preview shows; the tab holds the rest. */
const PREVIEW_COUNT = 3;

/** One Overview section: a hairline above, the content, no heading. */
export const OVERVIEW_SECTION = 'border-t border-border-hairline py-3 first:border-t-0';

/** The blue door from a preview to its tab — blue = tappable (owner 2026-10-03). */
export function OverviewDoor({ children, onClick, testId }: { children: string; onClick: () => void; testId?: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      radius="pill"
      onClick={onClick}
      data-testid={testId}
      className="ml-auto gap-0.5 font-semibold text-text-info hover:bg-fill-info/10 hover:text-text-info"
    >
      {children}
      <ChevronRight aria-hidden className="size-3.5" />
    </Button>
  );
}

/**
 * The ticket, in line: the newest three messages Messages-style (customer left on the sunken plane, ours
 * right on the info tint, internal notes with a lock on the warning tint), then the number + status and a
 * door to the Ticket tab, where the one composer lives.
 */
export function TaskTicketPreview({
  ticketNumber,
  status,
  nowMs,
  onOpen,
}: {
  ticketNumber: number;
  status: string | null;
  nowMs: number;
  onOpen: () => void;
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
  const visible = comments.slice(-PREVIEW_COUNT);
  const earlier = comments.length - visible.length;

  return (
    <section aria-label={`Ticket #${ticketNumber}`} className={cn(OVERVIEW_SECTION, 'flex flex-col gap-2')} data-testid="task-overview-ticket">
      {isLoading ? <p className="text-role-caption text-text-muted">Loading the ticket…</p> : null}
      {error ? (
        <p role="alert" className="text-role-caption text-text-danger">
          {error.message}
        </p>
      ) : null}
      <ol className="flex flex-col gap-2">
        {visible.map((comment) => {
          const who = people.get(comment.author_id);
          const ours = who?.agent ?? false;
          const internal = !comment.public;
          return (
            <li key={comment.id} className={cn('flex flex-col gap-1', ours ? 'items-end pl-12' : 'items-start pr-12')}>
              <span className="flex items-center gap-1 px-1 text-role-caption text-text-muted">
                {internal ? <Lock aria-label="Internal note" className="size-3" /> : null}
                <span className="font-semibold text-text-default">{who?.name ?? 'Customer'}</span>
                <span className="tabular-nums">{taskBoardAgo(Date.parse(comment.created_at), nowMs)}</span>
              </span>
              <p
                className={cn(
                  'line-clamp-6 whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-role-data text-text-default',
                  internal ? 'bg-fill-warning/15' : ours ? 'bg-fill-info/15' : 'bg-surface-sunken',
                )}
              >
                {comment.body.trim()}
              </p>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-2">
        <span className="text-role-data font-semibold tabular-nums text-text-default">#{ticketNumber}</span>
        <TicketStatusPill status={status} />
        <OverviewDoor onClick={onOpen} testId="task-overview-ticket-open">
          {earlier > 0 ? `All ${comments.length} messages` : 'Open thread'}
        </OverviewDoor>
      </div>
    </section>
  );
}

/** The newest events (ticket messages excluded — the ticket preview has them), then a door to the Timeline tab. */
export function TaskTimelinePreview({ taskId, nowMs, onOpen }: { taskId: number; nowMs: number; onOpen: () => void }) {
  const { items, loading } = useTaskTimeline(taskId, null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  if (loading || items.length === 0) return null;
  const visible = items.slice(0, PREVIEW_COUNT);
  return (
    <section aria-label="Timeline" className={cn(OVERVIEW_SECTION, 'flex flex-col')} data-testid="task-overview-timeline">
      <ol className="-mx-1.5 flex flex-col">
        {visible.map((item, index) => {
          const key = `${taskId}:${item.id}`;
          return (
            <TimelineRow
              key={key}
              item={item}
              nowMs={nowMs}
              first={index === 0}
              last={index === visible.length - 1}
              expanded={expanded.has(key)}
              onToggle={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (!next.delete(key)) next.add(key);
                  return next;
                })
              }
            />
          );
        })}
      </ol>
      <OverviewDoor onClick={onOpen} testId="task-overview-timeline-open">
        {items.length > visible.length ? `All ${items.length} events` : 'Log a call or note'}
      </OverviewDoor>
    </section>
  );
}

/** The task's documents by title (the Docs tab reads them in full, with comments); nothing when there are none. */
export function TaskDocsPreview({ taskId, onOpen }: { taskId: number; onOpen: () => void }) {
  const { documents } = useTaskDocuments(taskId);
  if (documents.length === 0) return null;
  return (
    <section aria-label="Documents" className={cn(OVERVIEW_SECTION, 'flex flex-col gap-0.5')} data-testid="task-overview-docs">
      {documents.map((doc) => (
        <button
          key={doc.id}
          type="button"
          onClick={onOpen}
          className="-mx-2 flex min-h-10 items-center gap-2.5 rounded-xl px-2 text-left transition-colors hover:bg-surface-hover"
        >
          <FileText aria-hidden className="size-4 shrink-0 text-text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-role-data font-medium text-text-default">{doc.title}</span>
            {doc.repoPath ?? doc.createdBy?.name ? (
              <span className="block truncate text-role-caption text-text-muted">{doc.repoPath ?? doc.createdBy?.name}</span>
            ) : null}
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-text-info" />
        </button>
      ))}
    </section>
  );
}
