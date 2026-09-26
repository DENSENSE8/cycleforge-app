'use client';

/** The agenda rail — the left column of the Daily composer stage. */

import { useCallback, useMemo } from 'react';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import type { RailPeekFact } from '@/components/sidebar/rail-shell/RailPeekIdentityFacts';
import {
  DAILY_AGENDA_TYPE_LABEL,
  isDailyAgendaWork,
  type DailyAgendaRow,
} from '@/lib/daily/daily-agenda-row';

const AGENDA_RAIL_LIMIT = 60;

function getAgendaStatusDot(row: DailyAgendaRow, nowMs: number): string {
  if (row.done) return 'bg-fill-success';
  if (isDailyAgendaWork(row) && row.deadlineAtMs != null && row.deadlineAtMs < nowMs) {
    return 'bg-fill-warning';
  }
  return 'bg-fill-info';
}

function getAgendaStatusDotLabel(row: DailyAgendaRow, nowMs: number): string {
  if (row.done) return 'Done';
  if (isDailyAgendaWork(row) && row.deadlineAtMs != null && row.deadlineAtMs < nowMs) {
    return 'Past its deadline';
  }
  return 'Open';
}

/** The row's copyable identities — one list feeding the peek and the ⋮ menu. */
const agendaFacts = (row: DailyAgendaRow): RailPeekFact[] => [
  { tone: 'order', value: isDailyAgendaWork(row) ? (row.recordLabel ?? '') : '' },
];

/** The rail shell keys selection on a NUMBER, and this list carries rows from two independently-numbered stores — `daily_check_items.id =… */
function agendaRailId(row: DailyAgendaRow): number {
  return isDailyAgendaWork(row) ? row.id : -row.id;
}

export function AgendaRecentRail({
  rows,
  selectedTaskId,
  onSelect,
  loading,
  nowMs,
}: {
  rows: readonly DailyAgendaRow[];
  /** Only a task has a record plane, so only a task can be the picked row. */
  selectedTaskId: number | null;
  onSelect: (row: DailyAgendaRow) => void;
  loading: boolean;
  /** The SAME clock the table read — never `Date.now()` per row. */
  nowMs: number;
}) {
  /** The desk owns the fetch (it also drives the ledger and the record), so the rail is handed settled rows and its `fetchFn` just returns them. */
  const version = useMemo(
    () => rows.map((r) => `${r.key}:${r.done ? 1 : 0}`).join('|'),
    [rows],
  );
  const queryKey = useMemo(() => ['daily-agenda.rail', version] as const, [version]);
  const ordered = useMemo(() => [...rows], [rows]);
  const fetchFn = useCallback(async () => ordered, [ordered]);

  const statusDot = useCallback((row: DailyAgendaRow) => getAgendaStatusDot(row, nowMs), [nowMs]);
  const statusDotLabel = useCallback(
    (row: DailyAgendaRow) => getAgendaStatusDotLabel(row, nowMs),
    [nowMs],
  );

  return (
    <SidebarRailScrollport>
      <SidebarRecentRailBase<DailyAgendaRow>
        queryKey={queryKey}
        fetchFn={fetchFn}
        selectedId={selectedTaskId}
        limit={AGENDA_RAIL_LIMIT}
        // Already banded and sorted by the desk. Do not hoist the selected row
        // — that would break the checklist-then-tasks order the bands declare.
        preserveServerOrder
        pinSelectedLead={false}
        eyebrowTitle="Agenda"
        emptyText={loading ? 'Loading the agenda…' : 'Nothing on the agenda'}
        getId={agendaRailId}
        getReconcileId={(row) => row.key}
        onSelect={onSelect}
        getStatusDot={statusDot}
        getStatusDotLabel={statusDotLabel}
        getCollapsePinLabel={(row) => row.title}
        getCollapsePinMeta={(row) => DAILY_AGENDA_TYPE_LABEL[row.type]}
        getCollapsePinFacts={agendaFacts}
        navRegionId="left"
        renderRowMain={(row, ctx) => (
          <div data-agenda-row-key={row.key} className="min-w-0 flex-1">
            <RailRowBody
              vm={{
                title: row.title,
                titleAttr: row.title,
                titleAccessory: ctx.pkgChip,
                meta: (
                  <span className="flex min-w-0 items-center gap-1 font-semibold uppercase tracking-widest text-text-soft">
                    <span className="truncate text-text-muted">
                      {DAILY_AGENDA_TYPE_LABEL[row.type]}
                    </span>
                    {row.urgency === 'urgent' && !row.done ? (
                      <span className="shrink-0 text-text-warning">· Urgent</span>
                    ) : null}
                  </span>
                ),
              }}
            />
          </div>
        )}
      />
    </SidebarRailScrollport>
  );
}
