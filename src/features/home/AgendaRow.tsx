'use client';

/**
 * One Daily agenda record as a {@link TriageRow} (owner 2026-09-28: the
 * Daily page is a readable, triageable task list) — the checklist item, the
 * task and the ticket in the SAME row: state · handle · title · due · who ·
 * team / from · links → the next verb. The tick lives where the triage face
 * puts verbs: the select bar's Mark done / Reopen (1 or N checked) and the
 * open record's own Check off / Mark done.
 */

import { memo, useMemo } from 'react';
import { format } from 'date-fns';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { agendaRecordState } from '@/lib/daily/agenda-record-state';
import { DAILY_AGENDA_TYPE_LABEL, type DailyAgendaRow } from '@/lib/daily/daily-agenda-row';
import type { TaskLinkKind } from '@/lib/tasks/task-links-shared';
import { DAILY_AGENDA_VIEW } from '@/lib/triage/views';

export type AgendaRowModel = { key: string; ids: readonly number[]; lead: DailyAgendaRow };

const LINK_NOUN: Readonly<Record<TaskLinkKind, string>> = { order: 'Order', tracking: 'Tracking', ticket: 'Ticket' };

/**
 * What the record carries beyond its title: `3 links · 2 files` on the row
 * (the title keeps its room), `Order 2 · Tracking 1 · Photo 2` in the tip.
 */
function attachmentFace(row: DailyAgendaRow): { face: string; tip: string } | null {
  const counts = new Map<TaskLinkKind, number>();
  for (const link of row.links) counts.set(link.kind, (counts.get(link.kind) ?? 0) + 1);
  const files = row.photoCount + row.videoCount + row.docCount;
  const face = [
    row.links.length ? `${row.links.length} link${row.links.length === 1 ? '' : 's'}` : null,
    files ? `${files} file${files === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  if (!face.length) return null;
  const tip = [
    ...[...counts].map(([kind, n]) => `${LINK_NOUN[kind]} ${n}`),
    row.photoCount > 0 ? `Photo ${row.photoCount}` : null,
    row.videoCount > 0 ? `Video ${row.videoCount}` : null,
    row.docCount > 0 ? `Docs ${row.docCount}` : null,
  ].filter(Boolean);
  return { face: face.join(' · '), tip: tip.join(' · ') };
}

/** `3:00 PM` from a checklist's civil `HH:MM` — the wall clock the floor reads. */
function civilTimeFace(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function dueFace(row: DailyAgendaRow): { face: string | null; title?: string } {
  if (row.type === 'checklist') return { face: row.dueTime ? civilTimeFace(row.dueTime) : null };
  if (row.deadlineAtMs == null) return { face: null };
  const due = new Date(row.deadlineAtMs);
  return { face: format(due, 'MMM d · h:mm a'), title: format(due, 'EEE MMM d, yyyy · h:mm a') };
}

function reminderFace(row: DailyAgendaRow): string | null {
  if (row.type === 'checklist') {
    if (row.dueTime == null || row.remindOffsetMinutes == null) return null;
    return row.remindOffsetMinutes === 0 ? 'At due' : `${row.remindOffsetMinutes}m before`;
  }
  return row.remindAtMs == null ? null : format(new Date(row.remindAtMs), 'MMM d · h:mm a');
}

/** The record's handle: the record a task points at, else its store and number. */
function agendaHandle(row: DailyAgendaRow): string {
  if (row.recordLabel) return row.recordLabel;
  return row.type === 'checklist' ? `Check ${row.id}` : `${DAILY_AGENDA_TYPE_LABEL[row.type]} ${row.id}`;
}

function agendaRowFace(row: DailyAgendaRow, nowMs: number, isToday: boolean): TriageRowFace {
  const state = agendaRecordState(row, nowMs, isToday);
  const due = dueFace(row);
  const reminder = reminderFace(row);
  const who = row.type === 'checklist' ? (row.ownerName ?? 'Whole shift') : (row.assigneeName ?? 'Unassigned');
  const handle = agendaHandle(row);
  const attached = attachmentFace(row);
  const noun = DAILY_AGENDA_TYPE_LABEL[row.type];
  return {
    state: state.face,
    identity: handle,
    title: row.title,
    facts: [
      {
        id: 'due',
        // A checklist item without a due time still says how often it comes back.
        value: due.face ?? (row.type === 'checklist' ? (row.cadence === 'once' ? 'Today only' : 'Every day') : null),
        width: 'code',
        tone: state.late ? 'warn' : due.face ? 'default' : 'muted',
        tip: [due.title ?? due.face, reminder ? `Remind ${reminder}` : null].filter(Boolean).join(' · ') || undefined,
      },
      { id: 'who', value: who, width: 'short', tone: 'muted', tip: who },
      {
        id: 'team',
        value:
          row.type === 'checklist'
            ? `Team ${row.teamDone ?? 0}/${row.teamTotal ?? 0}`
            : row.assignedByName
              ? `From ${row.assignedByName}`
              : null,
        width: 'short',
        tone: 'muted',
        tip: row.type === 'checklist' ? 'Staff who ticked it today' : (row.assignedByName ?? undefined),
      },
      { id: 'links', value: attached?.face ?? null, width: 'code', tone: 'muted', tip: attached?.tip },
    ],
    next: state.next ? { label: state.next, blocked: state.late } : null,
    aria: {
      row: `${noun} ${row.id}, ${state.word}, ${row.title}`,
      open: `Open ${noun.toLowerCase()} ${handle}: ${row.title}`,
      check: `Select "${row.title}"`,
    },
  };
}

/** No photo column: a task list reads by its words; the record shows the photos. */
export const AgendaListRow = memo(function AgendaListRow({
  nowMs,
  isToday,
  ...props
}: TriageCardSlotProps<DailyAgendaRow, AgendaRowModel> & { nowMs: number; isToday: boolean }) {
  const row = props.model.lead;
  const face = useMemo(() => agendaRowFace(row, nowMs, isToday), [row, nowMs, isToday]);
  return <TriageRow {...props} face={face} testIdPrefix={DAILY_AGENDA_VIEW.testIdPrefix} />;
});

/** The record's ONE status, top-right of its header: its state and where it goes next. */
export function AgendaRecordStatus({ row, nowMs, isToday }: { row: DailyAgendaRow; nowMs: number; isToday: boolean }) {
  const state = agendaRecordState(row, nowMs, isToday);
  return (
    <span className="flex min-w-0 items-center gap-2" data-testid="daily-record-status">
      <LifecycleCode state={state.face} srLabel={null}>
        {state.word}
      </LifecycleCode>
      {state.next ? (
        <span className="hidden truncate text-role-caption text-mode-muted @md/record-head:inline">→ {state.next}</span>
      ) : null}
    </span>
  );
}
