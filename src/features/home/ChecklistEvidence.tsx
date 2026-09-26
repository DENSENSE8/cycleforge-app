'use client';

/** The open DAILY CHECKLIST item in the Daily ledger's evidence column. */

import { useEffect, useState } from 'react';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { PomodoroTimer } from '@/components/ui/PomodoroTimer';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import {
  EVIDENCE_CONTROL_CLASS,
  EvidenceDecisionBar,
  EvidenceFact,
  EvidenceFacts,
  EvidenceSection,
  EvidenceTitle,
  evidenceVerbClass,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_HIT_CLASS } from '@/design-system/components/record-ledger/record-ledger-geometry';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';
import { agendaRecordState } from '@/lib/daily/agenda-record-state';
import type { DailyAgendaRow } from '@/lib/daily/daily-agenda-row';
import { CIVIL_TIME_RE } from '@/lib/reminders/reminder-contract';
import { useRecordView } from '@/lib/pomodoro/use-record-view';
import { cn } from '@/utils/_cn';

const REMIND_OFFSETS: ReadonlyArray<{ label: string; minutes: number | null }> = [
  { label: 'None', minutes: null },
  { label: 'At due', minutes: 0 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
];

export interface ChecklistSchedulePatch {
  dueTime?: string | null;
  remindOffsetMinutes?: number | null;
}

export function ChecklistEvidence({
  row,
  ticketId,
  dateKey,
  nowMs,
  isToday,
  canTick,
  canManage,
  pending,
  onToggle,
  onSchedule,
}: {
  row: DailyAgendaRow;
  dateKey: string;
  /** The paired Zendesk ticket's PROVIDER number, or null. */
  ticketId: number | null;
  nowMs: number;
  isToday: boolean;
  canTick: boolean;
  canManage: boolean;
  pending: boolean;
  onToggle: () => void;
  onSchedule: (patch: ChecklistSchedulePatch) => void;
}) {
  useRecordView('checklist', row.id, dateKey);
  const state = agendaRecordState(row, nowMs, isToday);
  const [face, setFace] = useState<'item' | 'ticket'>('item');
  useEffect(() => setFace('item'), [row.key]);
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  useEffect(() => setTimeDraft(null), [row.key, row.dueTime]);
  const time = timeDraft ?? row.dueTime ?? '';

  const commitTime = () => {
    if (timeDraft === null) return;
    const next = timeDraft.trim();
    if (next === (row.dueTime ?? '')) return;
    if (next === '') {
      // No due time means no reminder — the route refuses an orphan offset.
      onSchedule({ dueTime: null, remindOffsetMinutes: null });
    } else if (CIVIL_TIME_RE.test(next)) {
      onSchedule({ dueTime: next });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="checklist-evidence">
      <EvidenceTitle sub={row.cadence === 'once' ? 'One-off checklist item' : 'Daily checklist · every day'}>
        CHECK {row.id}
      </EvidenceTitle>
      <PomodoroTimer kind="checklist" id={row.id} date={dateKey} canRun={isToday && !row.done} />
      <div className={cn('flex items-center gap-2 border-b border-mode-ink px-4', RECORD_HIT_CLASS)}>
        <span aria-hidden className={cn('h-2 w-2 shrink-0', LIFECYCLE_CLASSES[state.lifecycle].dot)} />
        <span className={cn(RECORD_LABEL_CLASS, state.late ? 'text-mode-warn' : 'text-mode-ink')}>
          {state.code} · {state.word}
        </span>
        {state.next ? <span className={cn(RECORD_LABEL_CLASS, 'ml-auto text-mode-ink')}>→ {state.next}</span> : null}
      </div>

      {ticketId != null ? (
        <div className="border-b border-mode-rule px-4 py-2">
          <TabSwitch
            size="sm"
            tabs={[
              { id: 'item', label: 'Checklist item' },
              { id: 'ticket', label: `Ticket #${ticketId}` },
            ]}
            activeTab={face}
            onTabChange={(id) => setFace(id === 'ticket' ? 'ticket' : 'item')}
          />
        </div>
      ) : null}

      {face === 'ticket' && ticketId != null ? (
        <div className="h-[calc(100dvh-14rem)] min-h-[28rem]">
          <SupportTicketDetail ticketId={ticketId} embedded />
        </div>
      ) : (
        <>
          <EvidenceSection label="What to do">
            <p className="whitespace-pre-wrap text-role-body font-bold text-mode-ink">{row.title}</p>
            {row.description ? (
              <p className="mt-1 whitespace-pre-wrap text-role-data text-mode-muted">{row.description}</p>
            ) : null}
          </EvidenceSection>

          <EvidenceSection label="Due & reminder" testId="checklist-schedule">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <span className="w-20 text-role-caption text-mode-muted">Due at</span>
                <input
                  type="time"
                  value={time}
                  disabled={!canManage || pending}
                  onChange={(event) => setTimeDraft(event.target.value)}
                  onBlur={commitTime}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitTime();
                  }}
                  className={cn(EVIDENCE_CONTROL_CLASS, 'w-32 tabular-nums')}
                  aria-label="Due time (warehouse time)"
                  data-testid="checklist-due-time"
                />
                <span className="text-role-caption text-mode-muted">warehouse time, every day it is live</span>
              </label>
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Remind before due">
                <span className="w-20 text-role-caption text-mode-muted">Remind</span>
                {REMIND_OFFSETS.map((offset) => (
                  <button
                    key={offset.label}
                    type="button"
                    aria-pressed={row.remindOffsetMinutes === offset.minutes}
                    disabled={!canManage || pending || (row.dueTime == null && offset.minutes != null)}
                    onClick={() => onSchedule({ remindOffsetMinutes: offset.minutes })}
                    className={cn(evidenceVerbClass(row.remindOffsetMinutes === offset.minutes), 'min-h-0 py-1')}
                  >
                    {offset.label}
                  </button>
                ))}
              </div>
              {!canManage ? (
                <p className="text-role-caption text-mode-muted">Only a manager can change the checklist’s schedule.</p>
              ) : row.dueTime == null ? (
                <p className="text-role-caption text-mode-muted">Set a due time to turn on phone reminders.</p>
              ) : null}
            </div>
          </EvidenceSection>

          <EvidenceSection label="Today">
            <EvidenceFacts>
              <EvidenceFact label="Owner">{row.ownerName ?? 'Whole shift'}</EvidenceFact>
              <EvidenceFact label="Team" mono>
                {row.teamDone ?? 0} / {row.teamTotal ?? 0}
              </EvidenceFact>
              <EvidenceFact label="You">
                {row.done && row.markedAtMs != null
                  ? `Checked ${new Date(row.markedAtMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                  : 'Not yet'}
              </EvidenceFact>
            </EvidenceFacts>
          </EvidenceSection>

          <EvidenceDecisionBar
            verbs={[
              {
                label: row.done ? 'Undo check' : 'Check off',
                primary: !row.done,
                disabled: !canTick,
                onPress: onToggle,
                testId: 'checklist-toggle',
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
