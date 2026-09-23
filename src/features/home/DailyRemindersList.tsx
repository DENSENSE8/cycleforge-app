'use client';

/**
 * Daily (`/`) — the desk face of the agenda, as a REMINDERS list.
 *
 * This replaced the dense slot grid that used to paint the same rows. The grid
 * was asking the operator to read five tracks (photo, order, dates, status,
 * slack) to answer one question — *what do I still owe today* — and the phone
 * had already settled that question with a circle, a title and one grey line
 * (`MobileDailyRow`). Two faces of ONE agenda disagreeing about what a row IS
 * was the defect; this file ends it.
 *
 * The vocabulary is the phone's, at desk density:
 *
 *   ( ) Re-test the battery            Due today · Carton 4412 · Dana   ›
 *
 *  - the CIRCLE is the verb. A tick is the only edit a row takes in place;
 *    everything else is one click deeper. It is round rather than the house
 *    square box because that roundness is the whole signal that this column is
 *    a to-do list and not a table with a selection column — the grid's square
 *    checkbox meant "selected", and re-using it here would promise a bulk bar
 *    that does not exist.
 *  - ONE caption ({@link dailyAgendaCaption}), never two. What it carries is
 *    only what differs from the title.
 *  - the right edge holds at most one DOOR — the record the task points at.
 *    A checklist item has no record, so it grows no chevron rather than a
 *    disabled one.
 *
 * Presentational and hook-free on purpose: {@link DailyAgenda} keeps the whole
 * data layer (both stores, both mutations, the URL params) and this file keeps
 * the paint, so the render contract is testable with `react-dom/server` and no
 * router, no auth and no query client.
 *
 * The strike is {@link StruckLabel} — the same design-system face the phone
 * row paints, so one animation serves both surfaces.
 */

import type { ReactNode } from 'react';
import { ChevronRight } from '@/components/Icons';
import { Checkbox } from '@/design-system/primitives/Checkbox';
import { StruckLabel } from '@/design-system/components/StruckLabel';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  DAILY_AGENDA_TYPE_LABEL,
  bandDailyAgendaRows,
  isDailyAgendaWork,
  type DailyAgendaRow,
} from '@/lib/daily/daily-agenda-row';
import { dailyAgendaCaption } from '@/lib/daily/daily-agenda-caption';

/**
 * The reading measure. A to-do list is a column of sentences, so it is bound by
 * how far an eye tracks back to the next circle — not by the window. The old
 * grid was full-bleed because a table's job is to align columns; this one is
 * centred at ~46rem on any desk width.
 */
const LIST_MEASURE = 'mx-auto w-full max-w-[46rem]';

export interface DailyRemindersListProps {
  rows: readonly DailyAgendaRow[];
  /** One clock for every "Due today / Overdue" caption on the screen. */
  nowMs: number;
  /** The work row whose inspector is open, by `work_assignments.id`. */
  selectedTaskId: number | null;
  /** False on a checklist row while browsing a day that is not today. */
  canTick: (row: DailyAgendaRow) => boolean;
  onToggle: (row: DailyAgendaRow) => void;
  /** Opens the inspector rail. Only ever called for a WORK row. */
  onOpen: (row: DailyAgendaRow) => void;
  loading: boolean;
  /** The feed's own failure, verbatim; `null` when both stores answered. */
  error: string | null;
  /** Settled-with-no-rows: the sentence that teaches the next action. */
  emptyMessage: string;
}

export function DailyRemindersList({
  rows,
  nowMs,
  selectedTaskId,
  canTick,
  onToggle,
  onOpen,
  loading,
  error,
  emptyMessage,
}: DailyRemindersListProps) {
  const bands = bandDailyAgendaRows(rows);

  // The three settled-with-nothing states stay DISTINCT: a failure is not an
  // empty day, and a list still arriving is neither. One shared "no rows" face
  // would tell an operator the shift owes nothing while the request 500s.
  if (error) {
    return <ListNotice tone="danger">{error}</ListNotice>;
  }
  if (loading && bands.length === 0) {
    return <ListNotice tone="muted">Loading the agenda…</ListNotice>;
  }
  if (bands.length === 0) {
    return <ListNotice tone="muted">{emptyMessage}</ListNotice>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface-card" data-testid="daily-reminders">
      <div className={cn(LIST_MEASURE, 'px-4 py-5')}>
        {bands.map(([band, banded]) => (
          <section key={band} aria-labelledby={`daily-band-${band}`} className="mb-7 last:mb-0">
            <h2
              id={`daily-band-${band}`}
              className="flex items-baseline justify-between px-1 pb-1.5 text-role-eyebrow uppercase tracking-wider text-text-muted"
            >
              <span>{DAILY_AGENDA_TYPE_LABEL[band]}</span>
              {/* The count is the band's whole weight — how much is left in it. */}
              <span className="tabular-nums" data-band-count={band}>
                {banded.length}
              </span>
            </h2>
            {/* No card frame: the ground is white and so is the list, so a
                border here would draw a box around nothing (operator
                2026-09-23 — "remove the gray background … white on white is
                perfectly fine"). The hairlines BETWEEN rows are what separates
                one job from the next. */}
            <ul className="divide-y divide-border-hairline">
              {banded.map((row) => (
                <DailyReminderRow
                  key={row.key}
                  row={row}
                  nowMs={nowMs}
                  selected={isDailyAgendaWork(row) && selectedTaskId === row.id}
                  tickable={canTick(row)}
                  onToggle={() => onToggle(row)}
                  onOpen={() => onOpen(row)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function DailyReminderRow({
  row,
  nowMs,
  selected,
  tickable,
  onToggle,
  onOpen,
}: {
  row: DailyAgendaRow;
  nowMs: number;
  selected: boolean;
  tickable: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  /**
   * DOM identity is the ROW KEY, never the bare number: two stores number
   * independently, so `checklist:7` and `task:7` share a list and one shared
   * `id` would make the task's label tick the check.
   */
  const checkboxId = `daily-${row.key.replace(':', '-')}`;
  const work = isDailyAgendaWork(row);
  const caption = dailyAgendaCaption(row, nowMs);

  const title = (
    <>
      <StruckLabel struck={row.done}>
        <span className="block truncate text-role-data text-text-default">{row.title}</span>
      </StruckLabel>
      {caption.text ? (
        <span
          className={cn(
            'mt-0.5 block truncate text-role-micro',
            row.done ? 'text-text-faint' : caption.overdue ? 'text-text-danger' : 'text-text-muted',
          )}
        >
          {caption.text}
        </span>
      ) : null}
    </>
  );

  return (
    <li
      data-agenda-row-key={row.key}
      data-done={row.done}
      className={cn(
        'flex items-start gap-3 px-3 py-2.5 transition-colors',
        selected ? 'bg-surface-sunken' : 'hover:bg-surface-hover',
      )}
    >
      <Checkbox
        id={checkboxId}
        checked={row.done}
        disabled={!tickable}
        onCheckedChange={() => onToggle()}
        aria-label={`Mark "${row.title}" ${row.done ? 'not done' : 'done'}`}
        className={cn('mt-0.5 size-5 border-border-emphasis', cornerClass('pill'))}
      />
      {/*
       * A WORK row's title is a button, because it has a plane to open — the
       * inspector rail this surface already owns. A CHECKLIST item has none, so
       * its title is the tick target instead (a `<label>`, the same wiring the
       * phone row uses), which is the widest possible target for the only verb
       * it has. Never a button that opens nothing.
       */}
      {work ? (
        <button
          type="button"
          onClick={onOpen}
          aria-current={selected ? 'true' : undefined}
          className={cn(
            'min-w-0 flex-1 cursor-pointer select-none text-left',
            cornerClass('row'),
            focusRing('control'),
          )}
        >
          {title}
        </button>
      ) : (
        <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer select-none">
          {title}
        </label>
      )}
      {/*
       * The record door — the carton, order or helpdesk thread the task points
       * at. A different destination from the inspector (which edits the
       * ASSIGNMENT), so it earns its own hit area; a plain `<a>` because it is
       * a navigation and middle-click / open-in-new-tab should work.
       */}
      {work && row.recordHref ? (
        <a
          href={row.recordHref}
          aria-label={`Open ${row.recordLabel ?? row.title}`}
          className={cn(
            'grid h-8 w-8 shrink-0 place-content-center text-text-soft hover:bg-surface-sunken hover:text-text-default',
            cornerClass('control'),
            focusRing('control'),
          )}
        >
          <ChevronRight aria-hidden className="h-4 w-4" />
        </a>
      ) : null}
    </li>
  );
}

function ListNotice({ tone, children }: { tone: 'muted' | 'danger'; children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-surface-card" data-testid="daily-reminders">
      <div className={cn(LIST_MEASURE, 'px-4 py-16')}>
        <p
          className={cn(
            'text-center text-role-body',
            tone === 'danger' ? 'text-text-danger' : 'text-text-muted',
          )}
        >
          {children}
        </p>
      </div>
    </div>
  );
}
