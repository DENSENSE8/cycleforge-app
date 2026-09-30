'use client';

/**
 * The **Log** head of the rail's Timeline tab (`TaskRailTimeline`) — owner
 * 2026-09-29, phase 1 = free text. The operator writes what was said on a call
 * (or a note), sets WHEN they followed up (defaults to now, editable), and Logs
 * it: one append-only row in `work_assignment_follow_ups`
 * (`POST /api/tasks/[id]/follow-ups`), which also stamps the task's
 * `last_follow_up_at`. Emails are NOT typed here (owner 2026-09-30) — an email
 * is linked under the task's Links. The logged rows paint on the Timeline
 * hairline below, never here.
 *
 * Collapsed (the default) it is ONE board-voice row — the next chase on the
 * left, the ways to log on the right:
 *
 *   Next follow-up ◷ Tomorrow  [Tomorrow] [In 3 days] [Next week] [📅]    ☎ Call · ✎ Note
 *
 * A verb opens that channel's form inline beneath the row (body focused): what
 * was said, when it happened, [Log ⌘↵]. Log, Esc or the same verb again folds
 * it back to the row.
 */

import { useState } from 'react';
import { NotebookPen, Phone, Send, type LucideIcon } from 'lucide-react';
import { DateTimePickerField } from '@/design-system/components/DateTimePickerField';
import { TextField } from '@/design-system/primitives/TextField';
import { KeyboardKey } from '@/design-system/primitives';
import { useTaskFollowUps } from '@/lib/tasks/use-task-workspace';
import type { TaskDeskPatch } from '@/features/tasks/useTaskDesk';
import { addDaysToDateKey, getCurrentPSTDateKey, warehouseCivilTimeToInstant } from '@/utils/date';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { DueChip } from './task-board-atoms';

/** The channels an operator logs by hand; `ticket` replies log themselves from the Ticket tab later. */
type LogChannel = 'call' | 'note';
const CHANNELS: readonly { id: LogChannel; label: string; icon: LucideIcon }[] = [
  { id: 'call', label: 'Call', icon: Phone },
  { id: 'note', label: 'Note', icon: NotebookPen },
];

/** 9:00 AM warehouse time `days` from today — a chase starts the morning. */
function morningIn(days: number): string | null {
  return warehouseCivilTimeToInstant(addDaysToDateKey(getCurrentPSTDateKey(), days), '09:00')?.toISOString() ?? null;
}

export function TaskRailFollowUp({
  taskId,
  nextFollowUpMs,
  nowMs,
  onPatch,
}: {
  taskId: number;
  nextFollowUpMs: number | null;
  nowMs: number;
  onPatch: (patch: TaskDeskPatch) => Promise<unknown>;
}) {
  const { log } = useTaskFollowUps(taskId);
  /** Null = folded to the one-row head; a channel = that channel's form is open. */
  const [channel, setChannel] = useState<LogChannel | null>(null);
  const [body, setBody] = useState('');
  /** Null = "now" at the moment of Log; set once the operator picks a time. */
  const [occurredAt, setOccurredAt] = useState<Date | null>(null);

  const canLog = channel != null && !log.isPending && Boolean(body.trim());

  const submit = () => {
    if (!canLog || channel == null) return;
    log.mutate(
      { channel, occurredAt: (occurredAt ?? new Date()).toISOString(), body: body.trim() || null },
      {
        onSuccess: () => {
          setBody('');
          setOccurredAt(null);
          setChannel(null);
          toast.success('Follow-up logged');
        },
        onError: (error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not log the follow-up.'),
      },
    );
  };

  const quick: readonly { label: string; iso: string | null }[] = [
    { label: 'Tomorrow', iso: morningIn(1) },
    { label: 'In 3 days', iso: morningIn(3) },
    { label: 'Next week', iso: morningIn(7) },
  ];

  return (
    <div className="flex flex-col gap-2" data-testid="task-rail-follow-up">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <section className="flex min-w-0 items-center gap-1.5" aria-label="Next follow-up">
          <span className="shrink-0 text-[11px] font-semibold text-text-muted">Next follow-up</span>
          <DueChip dueMs={nextFollowUpMs} nowMs={nowMs} done={false} />
          {quick.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => void onPatch({ nextFollowUpAt: option.iso })}
              className="hidden h-6 shrink-0 rounded-full bg-surface-sunken px-2.5 text-[11px] font-medium text-text-default transition-colors hover:bg-surface-hover @2xl:inline-flex @2xl:items-center"
            >
              {option.label}
            </button>
          ))}
          {/* The chip above already names the chase; the picker stays a short "Pick" face and only sets a new one. */}
          <DateTimePickerField
            value={undefined}
            onChange={(next) => void onPatch({ nextFollowUpAt: next.toISOString() })}
            placeholder="Pick"
            className="h-6 w-auto shrink-0 rounded-full border-transparent bg-surface-sunken px-2 text-[11px] text-text-default"
          />
          {nextFollowUpMs != null ? (
            <button
              type="button"
              onClick={() => void onPatch({ nextFollowUpAt: null })}
              className="h-6 shrink-0 rounded-full px-1.5 text-[11px] font-medium text-text-muted hover:text-text-default"
            >
              Clear
            </button>
          ) : null}
        </section>

        <div role="group" aria-label="Log a follow-up" className="ml-auto flex shrink-0 items-center gap-0.5">
          {CHANNELS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={channel === id}
              aria-expanded={channel === id}
              onClick={() => setChannel((open) => (open === id ? null : id))}
              data-testid={`task-follow-up-open-${id}`}
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold transition-colors',
                channel === id
                  ? 'bg-surface-selected text-text-default ring-1 ring-border-soft'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text-default',
              )}
            >
              <Icon aria-hidden className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {channel != null ? (
        <section
          aria-label={channel === 'call' ? 'Log a call' : 'Log a note'}
          className="flex flex-col gap-2 rounded-2xl border border-border-hairline bg-surface-card p-2.5"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            } else if (event.key === 'Escape') {
              // Fold the form only; the record plane keeps its own Esc for the next press.
              event.preventDefault();
              event.stopPropagation();
              setChannel(null);
            }
          }}
        >
          <TextField
            key={channel}
            label={channel === 'call' ? 'What was said on the call' : 'What happened'}
            value={body}
            onChange={setBody}
            multiline
            rows={3}
            inputClassName="resize-y"
            autoFocus
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-text-muted">Followed up at</span>
            <DateTimePickerField
              value={occurredAt ?? undefined}
              onChange={setOccurredAt}
              placeholder="Now"
              toDate={new Date(nowMs)}
              className="w-auto"
            />
            {occurredAt ? (
              <button
                type="button"
                onClick={() => setOccurredAt(null)}
                className="text-[11px] font-medium text-text-muted hover:text-text-default"
              >
                Now
              </button>
            ) : null}
            <button
              type="button"
              onClick={submit}
              disabled={!canLog}
              data-testid="task-follow-up-log"
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-inverse pl-3.5 pr-1.5 text-[11px] font-semibold text-text-inverse transition-opacity disabled:opacity-40"
            >
              <Send aria-hidden className="size-3.5" />
              {log.isPending ? 'Logging…' : 'Log'}
              <KeyboardKey size="xs" tone="inverse">
                Ctrl ↵
              </KeyboardKey>
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
