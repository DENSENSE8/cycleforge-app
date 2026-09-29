'use client';

/**
 * One Daily agenda record as the shared three-row {@link RecordCard}: state
 * rail + identity, title, then due/owner/team/attachments and the next step.
 * Daily is a triage desk, never an industrial one-line ledger.
 */

import { memo, useMemo } from 'react';
import { format } from 'date-fns';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import type { RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import type { TriageCardSlotProps } from '@/design-system/components/triage-card-list/TriageCardList';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { agendaRecordState } from '@/lib/daily/agenda-record-state';
import { DAILY_AGENDA_TYPE_LABEL, type DailyAgendaRow } from '@/lib/daily/daily-agenda-row';
import type { TaskLinkKind } from '@/lib/tasks/task-links-shared';
import { DAILY_AGENDA_VIEW } from '@/lib/triage/views';
import { cn } from '@/utils/_cn';

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

function agendaCardModel(row: DailyAgendaRow, rowId: number, key: string, nowMs: number, isToday: boolean): RecordCardModel {
  const state = agendaRecordState(row, nowMs, isToday);
  const due = dueFace(row);
  const reminder = reminderFace(row);
  const who = row.type === 'checklist' ? (row.ownerName ?? 'Whole shift') : (row.assigneeName ?? 'Unassigned');
  const handle = agendaHandle(row);
  const attached = attachmentFace(row);
  const noun = DAILY_AGENDA_TYPE_LABEL[row.type];
  const dueText = due.face ?? (row.type === 'checklist' ? (row.cadence === 'once' ? 'Today only' : 'Every day') : null);
  const team =
    row.type === 'checklist'
      ? `Team ${row.teamDone ?? 0}/${row.teamTotal ?? 0}`
      : row.assignedByName
        ? `From ${row.assignedByName}`
        : null;
  return {
    key,
    leadId: rowId,
    state: state.face,
    stateIcon: recordStateGlyph(state.face),
    stateMeaning: state.word,
    alert: null,
    aria: {
      card: `${noun} ${row.id}, ${state.word}, ${row.title}`,
      open: `Open ${noun.toLowerCase()} ${handle}: ${row.title}`,
      check: `Select "${row.title}"`,
    },
    channel: null,
    person: null,
    chips: [],
    notes: { fixed: row.description ? { label: 'Instructions', text: row.description } : null, own: null },
    status: { kind: 'none' },
    next: state.next
      ? { label: state.next, tone: state.face.tone, tip: `Next: ${state.next.toLowerCase()} ${row.title}`, blocked: state.late }
      : null,
    lines: [
      {
        id: rowId,
        title: row.title,
        photoUrl: null,
        facts: {
          due: dueText ? { kind: 'text', text: reminder ? `${dueText} · remind ${reminder}` : dueText } : null,
          who: { kind: 'text', text: who },
          team: team ? { kind: 'text', text: team } : null,
          links: attached ? { kind: 'text', text: attached.face } : null,
        },
        alert: state.late,
        alertNote: state.late ? 'Past due' : null,
      },
    ],
    hiddenAlertLabel: () => '',
  };
}

/** No photo column: a task list reads by its words; the record shows media. */
export const AgendaCard = memo(function AgendaCard({
  nowMs,
  isToday,
  ...props
}: TriageCardSlotProps<DailyAgendaRow, AgendaRowModel> & { nowMs: number; isToday: boolean }) {
  const row = props.model.lead;
  const record = useMemo(
    () => agendaCardModel(row, props.model.ids[0]!, props.model.key, nowMs, isToday),
    [isToday, nowMs, props.model.ids, props.model.key, row],
  );
  return (
    <RecordCard
      {...props}
      model={record}
      factColumns={DAILY_AGENDA_VIEW.facts}
      testIdPrefix={DAILY_AGENDA_VIEW.testIdPrefix}
      onOpen={(event) => props.onOpen(row, event)}
      onToggleCheck={(event) => props.onToggleCheck(props.model, event)}
      onToggleExpand={() => props.onToggleExpand(props.model.key)}
      onTogglePeek={() => props.onTogglePeek(props.model.key)}
      identity={{ role: 'identity', content: <span className="font-mono text-xs font-semibold text-text-default">{agendaHandle(row)}</span> }}
      trailing={null}
      quickLook={null}
    />
  );
});

/** The record header stays simple: semantic dot + words, never a solid chip. */
export function AgendaRecordStatus({ row, nowMs, isToday }: { row: DailyAgendaRow; nowMs: number; isToday: boolean }) {
  const state = agendaRecordState(row, nowMs, isToday);
  return (
    <span className="flex min-w-0 items-center gap-2 text-role-caption" data-testid="daily-record-status">
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', STATE_TONE_CLASSES[state.face.tone].dot)} />
      <span className={cn('truncate font-medium', state.late ? 'text-text-warning' : 'text-text-muted')}>{state.word}</span>
      {state.next ? <span className="hidden truncate text-text-faint @md/record-head:inline">→ {state.next}</span> : null}
    </span>
  );
}
