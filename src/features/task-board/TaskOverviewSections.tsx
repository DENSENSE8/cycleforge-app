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

import { useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { useTaskDocuments } from '@/lib/tasks/use-task-workspace';
import { useTaskTimeline } from '@/lib/tasks/use-task-timeline';
import { cn } from '@/utils/_cn';
import { TimelineRow } from './TaskRailTimeline';

/** Newest events a preview shows; the tab holds the rest. */
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

/** The newest events, then a door to the Timeline tab. */
export function TaskTimelinePreview({ taskId, nowMs, onOpen }: { taskId: number; nowMs: number; onOpen: () => void }) {
  const { items, loading } = useTaskTimeline(taskId);
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
