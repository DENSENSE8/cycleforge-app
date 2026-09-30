'use client';

/**
 * The task sheet's FOLLOW-UPS — the phone twin of the desk rail's Timeline
 * tab (SURFACE_LAW: every operator verb completable on `/m/*`). Phase 1 is
 * free text (owner 2026-09-29): write the call / note, set when it happened
 * (defaults to now), Log. Emails are not typed here (owner 2026-09-30) — they
 * are linked under the sheet's Linked records. Same route, same hook
 * (`useTaskFollowUps` → `POST /api/tasks/[id]/follow-ups`). Below it, the same
 * merged stream the desk paints (`useTaskTimeline`: follow-ups, ticket
 * comments, task edits, alerts), newest 5 first, in the desk rail's row
 * anatomy: kind glyph + what happened; kind word · staffer · how long ago ·
 * detail; a hairline joining the glyphs. Tap a row to read it in full.
 */

import { useState } from 'react';
import { NotebookPen, Phone, type LucideIcon } from 'lucide-react';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { Button } from '@/design-system/primitives';
import { TextField } from '@/design-system/primitives/TextField';
import { DateTimePickerField } from '@/design-system/components/DateTimePickerField';
import { TASK_TIMELINE_KIND_FACE, taskBoardAgo } from '@/lib/task-board/task-board-model';
import { useTaskFollowUps } from '@/lib/tasks/use-task-workspace';
import { useTaskTimeline } from '@/lib/tasks/use-task-timeline';
import { TASK_TIMELINE_INITIAL_LIMIT, taskTimelineDetail, type TaskTimelineItem } from '@/lib/tasks/task-timeline';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

type HandChannel = 'call' | 'note';

const CHANNELS: readonly { id: HandChannel; label: string; icon: LucideIcon }[] = [
  { id: 'call', label: 'Call', icon: Phone },
  { id: 'note', label: 'Note', icon: NotebookPen },
];

export function MobileTaskFollowUps({
  taskId,
  ticketNumber,
  nowMs,
}: {
  taskId: number;
  ticketNumber: number | null;
  nowMs: number;
}) {
  const { log } = useTaskFollowUps(taskId);
  const { items, loading } = useTaskTimeline(taskId, ticketNumber);
  const [showAllFor, setShowAllFor] = useState<number | null>(null);
  const hidden = showAllFor === taskId ? 0 : Math.max(0, items.length - TASK_TIMELINE_INITIAL_LIMIT);
  const visible = hidden > 0 ? items.slice(0, TASK_TIMELINE_INITIAL_LIMIT) : items;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  /** Null = folded to the verbs; a channel = that channel's form is open. */
  const [channel, setChannel] = useState<HandChannel | null>(null);
  const [body, setBody] = useState('');
  const [occurredAt, setOccurredAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canLog = channel != null && !log.isPending && Boolean(body.trim());

  const submit = () => {
    if (!canLog || channel == null) return;
    setError(null);
    log.mutate(
      { channel, occurredAt: (occurredAt ?? new Date()).toISOString(), body: body.trim() || null },
      {
        onSuccess: () => {
          setBody('');
          setOccurredAt(null);
          setChannel(null);
        },
        onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Could not log the follow-up.'),
      },
    );
  };

  return (
    <div className="flex flex-col gap-2 pt-1" data-testid="mobile-task-follow-ups">
      <div role="group" aria-label="Log a follow-up" className="grid grid-cols-2 gap-1">
        {CHANNELS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={channel === id}
            aria-expanded={channel === id}
            onClick={() => setChannel((open) => (open === id ? null : id))}
            data-testid={`mobile-task-follow-up-open-${id}`}
            className={cn(
              'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full text-role-caption font-semibold transition-colors',
              channel === id ? 'bg-surface-selected text-text-default ring-1 ring-border-soft' : 'bg-surface-sunken text-text-muted',
            )}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </button>
        ))}
      </div>
      {channel != null ? (
        <>
          <TextField
            key={channel}
            label={channel === 'call' ? 'What was said on the call' : 'What happened'}
            value={body}
            onChange={setBody}
            multiline
            rows={3}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-role-caption font-semibold text-text-muted">Followed up</span>
            <DateTimePickerField
              value={occurredAt ?? undefined}
              onChange={setOccurredAt}
              placeholder="Now"
              toDate={new Date(nowMs)}
              className="min-h-11 flex-1"
            />
          </div>
          {error ? (
            <p role="alert" className="text-role-micro text-text-danger">
              {error}
            </p>
          ) : null}
          <Button variant="secondary" size="lg" className="min-h-12" disabled={!canLog} onClick={submit}>
            {log.isPending ? 'Logging…' : 'Log follow-up'}
          </Button>
        </>
      ) : null}

      <div className="pt-2" data-testid="mobile-task-timeline">
        {loading ? (
          <p className="text-role-caption text-text-muted">Loading the timeline…</p>
        ) : items.length === 0 ? (
          <p className="text-role-caption text-text-muted">Nothing logged on this task yet.</p>
        ) : (
          <ol className="flex flex-col">
            {visible.map((item, index) => {
              const key = `${taskId}:${item.id}`;
              return (
                <MobileTimelineRow
                  key={key}
                  item={item}
                  nowMs={nowMs}
                  first={index === 0}
                  last={index === visible.length - 1 && hidden === 0}
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
        )}
        {hidden > 0 ? (
          <Button
            variant="ghost"
            size="lg"
            className="mt-1 min-h-11"
            onClick={() => setShowAllFor(taskId)}
            data-testid="mobile-task-timeline-show-all"
          >
            Show {hidden} earlier {hidden === 1 ? 'event' : 'events'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MobileTimelineRow({
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
        className="flex min-h-11 w-full min-w-0 items-start gap-3 rounded-xl px-1 py-2 text-left outline-none active:bg-surface-hover focus-visible:bg-surface-hover"
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Icon aria-label={face.label} className={cn('size-4', face.ink)} strokeWidth={2.25} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn('text-role-data text-text-default', expanded ? 'break-words' : 'truncate')}>{item.title}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-role-micro text-text-muted">
            <span className={cn('shrink-0 font-semibold', face.text)}>{face.label}</span>
            {item.actor ? (
              <span className="flex min-w-0 shrink-0 items-center gap-1">
                {item.actorStaffId ? <StaffAvatar staffId={item.actorStaffId} name={item.actor} size="xs" alt="" /> : null}
                <StaffBadge staffId={item.actorStaffId} name={item.actor.split(' ')[0]} className="truncate font-semibold" />
              </span>
            ) : null}
            {when ? <span className="shrink-0 tabular-nums">{taskBoardAgo(atMs, nowMs)}</span> : null}
            {detail && !expanded ? <span className="min-w-0 truncate">{detail}</span> : null}
          </span>
          {expanded ? (
            <span className="mt-1 flex flex-col gap-1">
              {item.changes?.length ? (
                item.changes.map((change) => (
                  <span key={change.key} className="text-role-caption text-text-default">
                    <span className="text-text-muted">{change.key}: </span>
                    {change.before ?? '—'} → {change.after ?? '—'}
                  </span>
                ))
              ) : item.subtitle ? (
                <span className="whitespace-pre-wrap break-words text-role-caption text-text-default">{item.subtitle}</span>
              ) : null}
              {when ? <span className="text-role-micro tabular-nums text-text-muted">{when}</span> : null}
            </span>
          ) : null}
        </span>
      </button>
      {/* The hairline joining the glyphs, in the divider ink; it stops short of each glyph. */}
      {first ? null : <span aria-hidden className="pointer-events-none absolute left-[13.5px] top-0 h-1.5 w-px bg-border-hairline" />}
      {last ? null : <span aria-hidden className="pointer-events-none absolute bottom-0 left-[13.5px] top-[30px] w-px bg-border-hairline" />}
    </li>
  );
}
