'use client';

/**
 * The record's **Timeline** tab (owner 2026-09-29, R6: "what was said on the
 * call as a timeline with a vertical hairline of staff records"). Head = the
 * compact Log composer (`TaskRailFollowUp`); body = one merged stream —
 * follow-ups, ticket comments, created / owners / status / due edits and
 * alerts sent — newest 5, then "Show N earlier events".
 *
 * Each entry reads like a board row (TaskTable), in the board's own voice:
 *
 *   │ ✉  Emailed buyer@example.com
 *   │    Email  (MI) Michael  2d ago  Re: Wholesale pricing — Hi, following up…
 *   │ ☎  Called
 *   ┆    Call  (MI) Michael  3h ago  Left a voicemail.
 *
 * Line 1 = the kind glyph (`TASK_TIMELINE_KIND_FACE`, the one model map) + what
 * happened; line 2 = the coloured kind word · the staffer (dot + name in their
 * colour) · how long ago (the instant on hover) · the detail, truncated. A
 * hairline in the gutter joins the glyphs. Click a row to read it in full.
 */

import { useState } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives';
import type { TaskDeskPatch } from '@/features/tasks/useTaskDesk';
import { TASK_TIMELINE_KIND_FACE, taskBoardAgo } from '@/lib/task-board/task-board-model';
import { TASK_TIMELINE_INITIAL_LIMIT, taskTimelineDetail, type TaskTimelineItem } from '@/lib/tasks/task-timeline';
import { useTaskTimeline } from '@/lib/tasks/use-task-timeline';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { PeopleInline } from './task-board-atoms';
import { TaskRailFollowUp } from './TaskRailFollowUp';

export function TaskRailTimeline({
  taskId,
  ticketNumber,
  nextFollowUpMs,
  nowMs,
  onPatch,
}: {
  taskId: number;
  ticketNumber: number | null;
  nextFollowUpMs: number | null;
  nowMs: number;
  onPatch: (patch: TaskDeskPatch) => Promise<unknown>;
}) {
  const { items, loading } = useTaskTimeline(taskId, ticketNumber);
  // Keyed to the task: walking J/K to the next record starts it collapsed again.
  const [showAllFor, setShowAllFor] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const hidden = showAllFor === taskId ? 0 : Math.max(0, items.length - TASK_TIMELINE_INITIAL_LIMIT);
  const visible = hidden > 0 ? items.slice(0, TASK_TIMELINE_INITIAL_LIMIT) : items;

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="flex flex-col gap-3" data-testid="task-rail-timeline">
      <TaskRailFollowUp taskId={taskId} nextFollowUpMs={nextFollowUpMs} nowMs={nowMs} onPatch={onPatch} />

      <section aria-label="Timeline" data-testid="task-timeline" className="-mx-1.5 border-t border-border-hairline pt-3">
        <header className="mb-1 flex items-center justify-between px-1.5">
          <span className="text-[11px] font-semibold text-text-muted">Timeline</span>
          {items.length > 0 ? (
            <span className="text-[11px] tabular-nums text-text-muted">
              {items.length} {items.length === 1 ? 'event' : 'events'}
            </span>
          ) : null}
        </header>

        {loading ? (
          <div className="flex flex-col gap-2 px-1.5 py-1" aria-busy>
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-9 animate-pulse rounded-xl bg-surface-sunken" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-1.5 py-2 text-[13px] text-text-muted">Nothing logged on this task yet.</p>
        ) : (
          <ol className="flex flex-col">
            {visible.map((item, index) => {
              const key = `${taskId}:${item.id}`;
              return (
                <TimelineRow
                  key={key}
                  item={item}
                  nowMs={nowMs}
                  first={index === 0}
                  last={index === visible.length - 1 && hidden === 0}
                  expanded={expanded.has(key)}
                  onToggle={() => toggle(key)}
                />
              );
            })}
          </ol>
        )}

        {hidden > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-[26px] mt-0.5 h-7 px-1.5 text-[11px]"
            onClick={() => setShowAllFor(taskId)}
            data-testid="task-timeline-show-all"
          >
            Show {hidden} earlier {hidden === 1 ? 'event' : 'events'}
          </Button>
        ) : null}
      </section>
    </div>
  );
}

function TimelineRow({
  item,
  nowMs,
  first,
  last,
  expanded,
  onToggle,
}: {
  item: TaskTimelineItem;
  nowMs: number;
  first: boolean;
  last: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const face = TASK_TIMELINE_KIND_FACE[item.kind];
  const Icon = face.icon;
  const detail = taskTimelineDetail(item);
  const atMs = item.at ? Date.parse(item.at) : Number.NaN;
  const when = Number.isFinite(atMs) ? formatMonthDayTimePST(item.at) : null;

  return (
    <li className="relative" data-task-timeline-kind={item.kind}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="group/row flex w-full min-w-0 cursor-default items-start gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover"
      >
        {/* The gutter: the kind glyph on line 1's centre; the hairline (below) runs through this column. */}
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
          <Icon aria-label={face.label} className={cn('size-3.5', face.ink)} strokeWidth={2.25} />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span
            className={cn(
              'text-[13px] font-medium leading-[18px] text-text-default',
              expanded ? 'whitespace-normal break-words' : 'truncate',
            )}
          >
            {item.title}
          </span>

          <span className="flex min-w-0 items-center gap-2 text-[11px] leading-4">
            <span className={cn('shrink-0 font-semibold', face.text)}>{face.label}</span>
            {item.actorStaffId ? (
              <PeopleInline people={[{ id: item.actorStaffId, name: item.actor ?? 'Staff' }]} />
            ) : item.actor ? (
              <span className="shrink-0 truncate font-semibold text-text-muted">{item.actor}</span>
            ) : null}
            {when ? (
              <HoverTooltip label={when} placement="above" focusable={false} asChild>
                <span className="shrink-0 tabular-nums text-text-muted">{taskBoardAgo(atMs, nowMs)}</span>
              </HoverTooltip>
            ) : null}
            {detail && !expanded ? <span className="min-w-0 truncate text-text-muted">{detail}</span> : null}
          </span>

          {expanded ? (
            <span className="mt-1 flex flex-col gap-1">
              {item.changes?.length ? (
                item.changes.map((change) => (
                  <span key={change.key} className="text-[13px] leading-5 text-text-default">
                    <span className="text-text-muted">{change.key}: </span>
                    {change.before ?? '—'} → {change.after ?? '—'}
                  </span>
                ))
              ) : item.subtitle ? (
                <span className="whitespace-pre-wrap break-words text-[13px] leading-5 text-text-default">{item.subtitle}</span>
              ) : null}
              {when ? <span className="text-[11px] tabular-nums text-text-muted">{when}</span> : null}
            </span>
          ) : null}
        </span>
      </button>

      {/* The hairline joining the glyphs, in the board's divider ink; it stops short of each glyph. */}
      {first ? null : <span aria-hidden className="pointer-events-none absolute left-[14.5px] top-0 h-1.5 w-px bg-border-hairline" />}
      {last ? null : <span aria-hidden className="pointer-events-none absolute bottom-0 left-[14.5px] top-6 w-px bg-border-hairline" />}
    </li>
  );
}
