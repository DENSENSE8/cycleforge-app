'use client';

/** One Daily agenda row as an {@link IndustrialRecord} — the checklist item and the handed-over task in the SAME anatomy, so the eye reads… */

import { memo, useContext } from 'react';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { DROP, grammar } from '@/components/boot/welcome/motion-grammar';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { GridRowCheckbox } from '@/components/ui/GridRowCheckbox';
import {
  IndustrialRecord,
  RecordNext,
  RecordPhoto,
  RecordStamp,
  RecordTitle,
} from '@/design-system/components/record-ledger/IndustrialRecord';
import { RECORD_HIT_CLASS } from '@/design-system/components/record-ledger/record-ledger-geometry';
import { useReducedMotion } from '@/design-system/motion';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { photoContentUrl } from '@/lib/photos/display-url';
import { agendaRecordState } from '@/lib/daily/agenda-record-state';
import { DAILY_AGENDA_TYPE_LABEL, type DailyAgendaRow } from '@/lib/daily/daily-agenda-row';
import type { TaskLinkKind } from '@/lib/tasks/task-links-shared';
import { cn } from '@/utils/_cn';
import { DailyEntranceContext } from './DailyEntrance';

const ROW_HIDDEN_TRANSFORM = `translate3d(0, ${DROP.ROW_RISE_PX}px, 0)`;
const ROW_VISIBLE_TRANSFORM = 'translate3d(0, 0, 0)';

/** Band-1 kind stamp — three letters, one per store face. */
const KIND_CODE: Readonly<Record<DailyAgendaRow['type'], string>> = {
  checklist: 'CHK',
  task: 'TSK',
  ticket: 'TKT',
};

const LINK_CODE: Readonly<Record<TaskLinkKind, string>> = { order: 'ORD', tracking: 'TRK', ticket: 'TKT' };

/** `ORD 2 · TRK 1` — how many of each record the task names, in link order. */
function linkSummary(row: DailyAgendaRow): string {
  const counts = new Map<TaskLinkKind, number>();
  for (const link of row.links) counts.set(link.kind, (counts.get(link.kind) ?? 0) + 1);
  return [...counts].map(([kind, n]) => `${LINK_CODE[kind]} ${n}`).join(' · ');
}

/** `3:00 PM` from a checklist's civil `HH:MM` — the wall clock the floor reads. */
function civilTimeFace(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
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

export const AgendaRecord = memo(function AgendaRecord({
  row,
  open,
  nowMs,
  isToday,
  tickable,
  onOpen,
  onToggle,
  entranceIndex,
}: {
  row: DailyAgendaRow;
  open: boolean;
  nowMs: number;
  isToday: boolean;
  tickable: boolean;
  onOpen: (key: string) => void;
  onToggle: (row: DailyAgendaRow) => void;
  entranceIndex?: number;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const { phase } = useContext(DailyEntranceContext);
  const state = agendaRecordState(row, nowMs, isToday);
  const due = dueFace(row);
  const reminder = reminderFace(row);
  const links = linkSummary(row);
  const who = row.type === 'checklist' ? row.ownerName : row.assigneeName;
  const media = [
    row.photoCount > 0 ? `Photo ${row.photoCount}` : null,
    row.videoCount > 0 ? `Video ${row.videoCount}` : null,
    row.docCount > 0 ? `Docs ${row.docCount}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <motion.div
      initial={
        phase === 'revealed'
          ? false
          : reduceMotion
            ? { opacity: 0 }
            : { opacity: 0, transform: ROW_HIDDEN_TRANSFORM }
      }
      animate={
        phase === 'rows' || phase === 'revealed'
          ? reduceMotion
            ? { opacity: 1 }
            : { opacity: 1, transform: ROW_VISIBLE_TRANSFORM }
          : reduceMotion
            ? { opacity: 0 }
            : { opacity: 0, transform: ROW_HIDDEN_TRANSFORM }
      }
      transition={{
        ...(reduceMotion ? grammar(true).move : DROP.ROW),
        delay:
          phase === 'rows'
            ? Math.min(entranceIndex ?? 0, DROP.STAGGER_CAP) * DROP.STAGGER_S
            : 0,
      }}
      style={{ willChange: phase === 'revealed' ? 'auto' : 'transform, opacity' }}
    >
      <IndustrialRecord
      recordKey={row.key}
      state={state.face}
      open={open}
      openLabel={`${DAILY_AGENDA_TYPE_LABEL[row.type]} ${row.id}, ${state.word}, ${row.title}`}
      onOpen={() => onOpen(row.key)}
      photo={
        <RecordPhoto
          src={row.coverPhotoId != null ? photoContentUrl(row.coverPhotoId, 'thumb') : null}
          fallback={row.title}
        />
      }
      bands={[
        {
          main: (
            <>
              <span className="pointer-events-auto -ml-2 shrink-0">
                <GridRowCheckbox
                  checked={row.done}
                  disabled={!tickable}
                  onToggle={() => onToggle(row)}
                  label={`Mark "${row.title}" ${row.done ? 'not done' : 'done'}`}
                  className={cn(RECORD_HIT_CLASS, 'w-8 items-center pt-0')}
                />
              </span>
              <span
                className={cn(
                  RECORD_LABEL_CLASS,
                  'w-10 shrink-0',
                  state.late ? 'text-mode-warn' : row.done ? 'text-mode-muted' : 'text-mode-ink',
                )}
                title={state.word}
              >
                {state.code}
              </span>
              <span className={cn(RECORD_LABEL_CLASS, 'w-8 shrink-0 text-mode-muted')}>{KIND_CODE[row.type]}</span>
              {row.recordLabel ? (
                <span className={cn(RECORD_ID_CLASS, 'shrink-0 truncate text-mode-ink')}>{row.recordLabel}</span>
              ) : row.type === 'checklist' ? (
                <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>
                  {row.cadence === 'once' ? 'One-off' : 'Every day'}
                </span>
              ) : null}
              {links ? (
                <span className={cn(RECORD_LABEL_CLASS, 'truncate text-mode-muted')} title={row.links.map((l) => l.label).join(', ')}>
                  + {links}
                </span>
              ) : null}
            </>
          ),
          right: <RecordStamp title={due.title}>{due.face}</RecordStamp>,
        },
        {
          main: <RecordTitle>{row.title}</RecordTitle>,
          right: reminder ? (
            <span className={cn(RECORD_LABEL_CLASS, 'w-full truncate text-left text-mode-ink')} title="Reminder">
              <span className="text-mode-muted">Remind </span>
              {reminder}
            </span>
          ) : null,
        },
        {
          main: (
            <>
              <span className="inline-flex w-40 shrink-0 items-center gap-1.5">
                {who ? (
                  <StaffAvatar staffId={row.ownerId} name={who} size="xs" face="record" />
                ) : null}
                <span className={cn(RECORD_LABEL_CLASS, 'truncate text-mode-muted')}>
                  {who ?? (row.type === 'checklist' ? 'Whole shift' : 'Unassigned')}
                </span>
              </span>
              {row.type === 'checklist' ? (
                <span className={cn(RECORD_LABEL_CLASS, 'w-20 shrink-0 tabular-nums text-mode-muted')}>
                  Team {row.teamDone ?? 0}/{row.teamTotal ?? 0}
                </span>
              ) : (
                <span className={cn(RECORD_LABEL_CLASS, 'w-32 shrink-0 truncate text-mode-muted')}>
                  {row.assignedByName ? `From ${row.assignedByName}` : ''}
                </span>
              )}
              <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>{media}</span>
              {row.description ? (
                <span className="min-w-0 flex-1 truncate text-role-data text-mode-muted" title={row.description}>
                  {row.description}
                </span>
              ) : null}
            </>
          ),
          right: <RecordNext label={state.next} warn={state.late} />,
        },
      ]}
      />
    </motion.div>
  );
});
