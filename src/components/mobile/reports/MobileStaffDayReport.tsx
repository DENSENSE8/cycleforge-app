'use client';

/**
 * Reports → the staff day — the phone face of "what did the shift actually do".
 *
 * THE MOBILE SoT for the manager read (SURFACE_LAW §1: every operator verb is
 * completable on `/m` first, and this one ships before its desk twin by law,
 * not preference). Operator 2026-09-15: *"the manager would be able to look at
 * all the daily reports via a certain day … the staff member checked off this
 * checklist at this time, completed this task at this time"* and *"view only in
 * a manager"*.
 *
 * ONE JOB: pick a day, pick a person, read their tasks and times. Surface class
 * B (phone browse — the roster IS the product), so: banded CARDS plus a
 * `BottomSheet` detail, never a `DataTable` (SURFACE_LAW §5). **No primary
 * CTA** — this surface commits nothing, and inventing one would be a fake job.
 *
 * READ-ONLY, and structurally so: it renders `buildStaffDayAgendas`, a pure
 * merge of the day report and the assigned-task list, and holds no mutation.
 * The desk Staff family (R4) will consume the SAME projection, so the two
 * faces cannot disagree about a shift.
 *
 * TWO STORES, ONE LIST (operator 2026-09-23): a checklist tick and a task
 * handed to that person are both "what they did today", so the sheet reads
 * them as one timeline and the card prints one fraction. The task half is
 * ADDITIVE — a manager may hold `operations.view` without `work_orders.claim`,
 * `GET /api/tasks` 403s for them, and the report then shows the checks it can
 * see rather than an error where a day used to be.
 *
 * Day selection is NOT owned here any more: `MobileReportsView` holds the
 * `dateKey` and mounts `MobileReportDayStepper`, because the Packing tab reads
 * the same day and two steppers on one screen would be two days. This
 * component takes the day it is told to render.
 *
 * Boundary: platform layer + `src/lib` only. `StaffPickerList` and the desk
 * report grids are feature dirs `/m` may not import; the roster row is composed
 * from `StaffAvatar` (identity) and the projection.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TicketChip } from '@/components/ui/CopyChip';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useDailyChecks } from '@/lib/daily-checks/use-daily-checks';
import { buildStaffDay, buildStaffDays } from '@/lib/daily-checks/staff-day';
import {
  buildStaffDayAgenda,
  buildStaffDayAgendas,
  type StaffDayAgenda,
  type StaffDayEntry,
} from '@/lib/daily/staff-day-agenda';
import {
  taskDeskRowFromWire,
  type TaskDeskListPayload,
  type TaskDeskRow,
} from '@/lib/tasks/task-desk-row';
import { formatStageClockTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

const FACT = 'text-role-micro text-text-muted';

/** Cookie session; never a cached answer for a day the operator just stepped to. */
const FRESH: RequestInit = { credentials: 'include', cache: 'no-store' };

const NO_TASKS: readonly TaskDeskRow[] = [];

/**
 * Every live handoff, not just this viewer's — the report reads a PEER's day,
 * so `assignee=all`. `lane=all` because a canceled row must be visible to the
 * membership rule that drops it; filtering server-side would make "withdrawn"
 * indistinguishable from "never existed".
 */
async function fetchDayTasks(): Promise<TaskDeskRow[]> {
  const res = await fetch('/api/tasks?lane=all&assignee=all&limit=200', FRESH);
  if (!res.ok) throw new Error(`Could not load tasks (${res.status})`);
  const payload = (await res.json()) as TaskDeskListPayload;
  return (payload.tasks ?? []).map(taskDeskRowFromWire);
}

/** One staffer's card — who, how far through, when they last touched the day. */
function RosterCard({ day, onOpen }: { day: StaffDayAgenda; onOpen: () => void }) {
  const complete = day.total > 0 && day.doneCount >= day.total;
  return (
    <li>
      {/* ds-raw-button: the row IS the card — a full-bleed tappable record row,
          not an action button (the house Button would paint a CTA face here). */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${day.name}, ${day.doneCount} of ${day.total} done`}
        className={cn(
          'ds-raw-button flex min-h-14 w-full items-center gap-3 border border-border-hairline bg-surface-card px-3 py-2 text-left',
          MOBILE_ROW_CORNER,
          focusRing('control', 'accent'),
        )}
      >
        <StaffAvatar staffId={day.staffId} name={day.name} size="sm" alt="" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-role-data text-text-default">{day.name}</span>
          {/*
           * ONE meta cluster under the name, never independent chips: the
           * fraction and the last touch answer the same question ("how far in
           * are they?") and split chips make a 390px row read as two facts
           * competing for the same glance. The fraction is COMBINED — a
           * checks-only number beside a list that also shows tasks is the
           * two-task-systems bug wearing a smaller hat.
           */}
          <span className={cn('mt-0.5 block truncate', FACT)}>
            {day.doneCount} of {day.total} done
            {day.lastActivityAt
              ? ` · last ${formatStageClockTimePST(day.lastActivityAt)}`
              : ' · nothing yet'}
          </span>
        </span>
        {/*
         * The completion mark is TEXT, not a colour-only dot: a green pip is
         * invisible to a colour-blind lead and unreadable in warehouse light.
         */}
        <span
          className={cn(
            'shrink-0 text-role-micro font-semibold uppercase tracking-wide',
            complete ? 'text-text-success' : 'text-text-faint',
          )}
        >
          {complete ? 'Done' : `${Math.max(day.total - day.doneCount, 0)} left`}
        </span>
      </button>
    </li>
  );
}

/** One line of the day — either store, told apart by its tag, not by its shape. */
function EntryRow({ entry }: { entry: StaffDayEntry }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-border-hairline pb-2 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block text-role-caption text-text-default">{entry.title}</span>
        {/*
         * The SOURCE tag stays even though both stores render identically: a
         * lead asking "did they do their checks?" gets a different answer from
         * "did they clear what I threw at them?", and an untagged merged list
         * cannot be read for either.
         */}
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="text-role-micro uppercase tracking-wide text-text-faint">
            {entry.source === 'check' ? 'Check' : 'Task'}
          </span>
          {entry.recordLabel ? <span className={FACT}>{entry.recordLabel}</span> : null}
          {entry.ticketId != null ? (
            <TicketChip value={String(entry.ticketId)} display={`#${entry.ticketId}`} dense />
          ) : null}
        </span>
      </span>
      {/*
       * The TIME is the point. An unfinished row keeps its place and says so in
       * words — a blank cell reads as a rendering bug, and the miss is the most
       * actionable thing on this screen.
       */}
      <span
        className={cn(
          'shrink-0 tabular-nums',
          entry.doneAt
            ? 'text-role-caption text-text-default'
            : 'text-role-micro uppercase tracking-wide text-text-faint',
        )}
      >
        {entry.doneAt
          ? formatStageClockTimePST(entry.doneAt)
          : entry.source === 'check'
            ? 'Not checked'
            : 'Not done'}
      </span>
    </li>
  );
}

/** That staffer's day, row by row — the sentence the whole feature serves. */
function StaffDaySheet({ day, onClose }: { day: StaffDayAgenda | null; onClose: () => void }) {
  return (
    <BottomSheet
      open={day !== null}
      onClose={onClose}
      forceVariant="sheet"
      compact
      scrollBody
      scrollBodyMaxHeightClass="max-h-[70svh]"
    >
      {day ? (
        <>
          <div className="flex shrink-0 items-baseline justify-between gap-3 px-1 pb-2">
            <span className="min-w-0 truncate text-role-caption font-semibold text-text-default">
              {day.name}
            </span>
            <span className="shrink-0 text-role-micro tabular-nums text-text-faint">
              {day.doneCount} / {day.total}
            </span>
          </div>
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-1 pb-2">
            {day.entries.map((entry) => (
              <EntryRow key={entry.key} entry={entry} />
            ))}
            {day.entries.length === 0 ? (
              <li className="text-role-caption text-text-muted">
                Nothing was on this person&apos;s list that day.
              </li>
            ) : null}
          </ul>
        </>
      ) : null}
    </BottomSheet>
  );
}

export function MobileStaffDayReport({ dateKey }: { dateKey: string }) {
  const [openStaffId, setOpenStaffId] = useState<number | null>(null);

  const { data, isLoading, isError } = useDailyChecks(dateKey);

  /*
   * `retry: false` because the failure this query actually has is a 403, and
   * retrying a refusal three times only delays the checks-only report the
   * manager can still read.
   */
  const taskQuery = useQuery({
    queryKey: ['tasks', 'staff-day', 'all'] as const,
    queryFn: fetchDayTasks,
    retry: false,
    staleTime: 30_000,
  });
  // ONE frozen empty array, so a 403 (or the first paint) does not hand the
  // memos a fresh identity every render and rebuild the whole roster.
  const tasks = taskQuery.data ?? NO_TASKS;

  const days = useMemo(
    () => (data ? buildStaffDayAgendas(buildStaffDays(data), tasks) : []),
    [data, tasks],
  );
  const openDay = useMemo(() => {
    if (!data || openStaffId == null) return null;
    const day = buildStaffDay(data, openStaffId);
    return day ? buildStaffDayAgenda(day, tasks) : null;
  }, [data, openStaffId, tasks]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        <ul className="flex flex-col gap-2">
          {days.map((day) => (
            <RosterCard key={day.staffId} day={day} onOpen={() => setOpenStaffId(day.staffId)} />
          ))}
        </ul>

        {isLoading ? (
          <p className="pt-6 text-role-caption text-text-muted">Loading the day…</p>
        ) : null}
        {isError ? (
          <p role="alert" className="pt-6 text-role-caption text-text-muted">
            Could not load that day.
          </p>
        ) : null}
        {!isLoading && !isError && days.length === 0 ? (
          <p className="pt-6 text-role-caption text-text-muted">
            Nobody was on the roster that day.
          </p>
        ) : null}
      </div>

      <StaffDaySheet day={openDay} onClose={() => setOpenStaffId(null)} />
    </div>
  );
}
