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
 * READ-ONLY, and structurally so: it renders `buildStaffDay`, a pure projection
 * of the day report, and holds no mutation. The desk Staff family (R4) will
 * consume the SAME projection, so the two faces cannot disagree about a shift.
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
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TicketChip } from '@/components/ui/CopyChip';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useDailyChecks } from '@/lib/daily-checks/use-daily-checks';
import { buildStaffDay, buildStaffDays, type StaffDay } from '@/lib/daily-checks/staff-day';
import { formatStageClockTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

const FACT = 'text-role-micro text-text-muted';

/** One staffer's card — who, how far through, when they last touched the list. */
function RosterCard({ day, onOpen }: { day: StaffDay; onOpen: () => void }) {
  const complete = day.total > 0 && day.doneCount >= day.total;
  return (
    <li>
      {/* ds-raw-button: the row IS the card — a full-bleed tappable record row,
          not an action button (the house Button would paint a CTA face here). */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${day.name}, ${day.doneCount} of ${day.total} checked`}
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
           * competing for the same glance.
           */}
          <span className={cn('mt-0.5 block truncate', FACT)}>
            {day.doneCount} of {day.total} checked
            {day.lastMarkedAt ? ` · last ${formatStageClockTimePST(day.lastMarkedAt)}` : ' · nothing yet'}
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

/** That staffer's day, task by task — the sentence the whole feature serves. */
function StaffDaySheet({ day, onClose }: { day: StaffDay | null; onClose: () => void }) {
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
            {day.tasks.map((task) => (
              <li
                key={task.itemId}
                className="flex items-baseline justify-between gap-3 border-b border-border-hairline pb-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-role-caption text-text-default">{task.title}</span>
                  {task.ticketId != null ? (
                    <span className="mt-0.5 flex">
                      <TicketChip value={String(task.ticketId)} display={`#${task.ticketId}`} dense />
                    </span>
                  ) : null}
                </span>
                {/*
                 * The TIME is the point. An unchecked task keeps its row and
                 * says so in words — a blank cell reads as a rendering bug, and
                 * a missed check is the most actionable thing on this screen.
                 */}
                <span
                  className={cn(
                    'shrink-0 tabular-nums',
                    task.checkedAt
                      ? 'text-role-caption text-text-default'
                      : 'text-role-micro uppercase tracking-wide text-text-faint',
                  )}
                >
                  {task.checkedAt ? formatStageClockTimePST(task.checkedAt) : 'Not checked'}
                </span>
              </li>
            ))}
            {day.tasks.length === 0 ? (
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

  const days = useMemo(() => (data ? buildStaffDays(data) : []), [data]);
  const openDay = useMemo(
    () => (data && openStaffId != null ? buildStaffDay(data, openStaffId) : null),
    [data, openStaffId],
  );

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
