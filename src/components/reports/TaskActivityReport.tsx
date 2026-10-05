'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/design-system/primitives/EmptyState';
import { cornerClass } from '@/design-system/tokens/radius';
import { formatDateKeyMedium } from '@/utils/date';
import {
  activityStaffTotals,
  activityDetailHref,
  activityStaffLabel,
  activityRowKey,
  eventsByActivityRow,
  fetchTaskActivityReport,
  formatActivityClock,
  formatActivityDuration,
  type TaskActivityRow,
} from '@/lib/reports/task-activity-report';
import { cn } from '@/utils/_cn';

type KindFilter = 'all' | TaskActivityRow['kind'];

/** Staff (`staffId`) and record kind (`type`) are sidebar controls; the body reads the URL. */
export function TaskActivityReport({ dateKey, staffId }: { dateKey: string; staffId: number | null }) {
  const typeParam = useSearchParams().get('type');
  const kind: KindFilter = typeParam === 'task' || typeParam === 'checklist' ? typeParam : 'all';
  const query = useQuery({
    queryKey: ['task-activity-report', dateKey],
    queryFn: () => fetchTaskActivityReport(dateKey),
    retry: false,
    staleTime: 30_000,
  });
  const rows = query.data?.rows;
  const events = useMemo(() => eventsByActivityRow(query.data?.events ?? []), [query.data?.events]);
  const filtered = rows?.filter((row) =>
    (staffId === null || row.staffId === staffId) && (kind === 'all' || row.kind === kind),
  ) ?? [];
  const staffTotals = activityStaffTotals(filtered);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-6" aria-label="Task time and activity">
      {query.data ? <p className="text-role-micro text-text-muted">{filtered.length} of {rows?.length ?? 0} staff / record / day rows · warehouse time</p> : null}
      <p className="text-role-micro text-text-muted">
        Measured focus is tracked session time per staff and task. View, completion and audit interactions are timestamps, not measured work. Task lifecycle is separate, unattributed wall-clock from start to completion: not staff time or measured focus. Activity before tracking began may not appear.
      </p>
      {query.isPending ? <p role="status" className="py-6 text-role-caption text-text-muted">Loading activity…</p> : null}
      {query.isError ? <p role="alert" className="py-6 text-role-caption text-text-muted">{query.error.message}</p> : null}
      {query.data && filtered.length === 0 ? (
        <EmptyState
          title={staffId !== null || kind !== 'all' ? 'No activity with these filters' : 'No tracked activity'}
          description={`No per-staff tracked task or checklist activity recorded for ${formatDateKeyMedium(dateKey, { withYear: true })}. This does not mean no work occurred.`}
        />
      ) : null}
      {query.data && staffTotals.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Measured focus by staff for the selected day">
          {staffTotals.map((total) => (
            <li key={total.staffId} className={cn(cornerClass('surface'), 'border border-border-hairline bg-surface-card px-3 py-2 text-role-caption text-text-default')}>
              <strong>{activityStaffLabel(total.staffId, total.staffName)}</strong> · {total.records} {total.records === 1 ? 'record' : 'records'} · {formatActivityDuration(total.measuredFocusSeconds)} measured focus
            </li>
          ))}
        </ul>
      ) : null}
      {query.data && kind !== 'checklist' && query.data.taskLifecycles.length > 0 ? (
        <section aria-label="Task lifecycle wall-clock time for the selected day">
          <h2 className="text-role-caption font-semibold text-text-default">Task lifecycle · all staff</h2>
          <p className="text-role-micro text-text-muted">Unmeasured task wall-clock, independent of the staff filter. Task time is not assigned to any staffer and must not be added to measured focus.</p>
          <ul className="mt-2 grid gap-2 lg:grid-cols-2">
            {query.data.taskLifecycles.map((lifecycle) => (
              <li key={`${lifecycle.taskId}:${lifecycle.completedAt}`} className={cn(cornerClass('surface'), 'border border-border-hairline bg-surface-card px-3 py-2 text-role-caption text-text-default')}>
                <Link href={`/?task=${lifecycle.taskId}&scope=everyone`} className="font-semibold text-text-accent underline underline-offset-2">Task #{lifecycle.taskId}</Link>
                {' · '}{formatDateKeyMedium(lifecycle.date, { withYear: true })}
                <p className="text-role-micro text-text-muted">Start {formatActivityClock(lifecycle.startedAt)} · Completed {formatActivityClock(lifecycle.completedAt)}</p>
                <p className="font-mono tabular-nums">{formatActivityDuration(lifecycle.elapsedSeconds)} lifecycle elapsed · wall clock, unmeasured</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {query.data ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {filtered.map((row) => {
            const trail = events.get(activityRowKey(row)) ?? [];
            return (
              <li key={activityRowKey(row)} className={cn(cornerClass('surface'), 'min-w-0 border border-border-hairline bg-surface-card px-4 py-3')}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-role-caption font-semibold text-text-default">{row.title || `${row.kind === 'task' ? 'Task' : 'Checklist'} #${row.id}`}</p>
                    <p className="text-role-micro text-text-muted">{activityStaffLabel(row.staffId, row.staffName)} · {row.kind === 'task' ? 'Task' : 'Checklist'} #{row.id} · {formatDateKeyMedium(row.date, { withYear: true })}</p>
                  </div>
                  <Link href={activityDetailHref(row)} className="text-role-caption font-semibold text-text-accent underline underline-offset-2">Open record</Link>
                </div>
                <dl className="mt-3 border-t border-border-hairline pt-3 text-role-caption">
                  <div><dt className="text-role-micro text-text-muted">Measured focus · this staffer</dt><dd className="font-mono tabular-nums text-text-default">{formatActivityDuration(row.measuredFocusSeconds)}</dd></div>
                </dl>
                <details className="mt-3 border-t border-border-hairline pt-2">
                  <summary className="cursor-pointer text-role-caption font-medium text-text-default">Viewed {row.viewedAt.length} · Worked {row.workedAt.length} · Completed {row.completedAt.length} · Event details</summary>
                  <div className="mt-3 space-y-3 text-role-caption">
                    {([['Viewed', row.viewedAt], ['Worked', row.workedAt], ['Completed', row.completedAt]] as const).map(([label, times]) => (
                      <p key={label} className="text-text-muted"><strong className="font-medium text-text-default">{label} ({times.length}):</strong> {times.length ? times.map(formatActivityClock).join(' · ') : 'None'}</p>
                    ))}
                    <h3 className="font-semibold text-text-default">Event trail</h3>
                    {trail.length ? (
                      <ol className="space-y-2">
                        {trail.map((event) => (
                          <li key={event.eventId} className="flex flex-wrap justify-between gap-x-3 border-b border-border-hairline pb-1 last:border-0">
                            <span className="capitalize text-text-default">{event.event} · {formatActivityClock(event.at)}</span>
                            <span className="break-all text-text-muted">{event.source}{event.durationSeconds == null ? '' : ` · ${formatActivityDuration(event.durationSeconds)}`}</span>
                          </li>
                        ))}
                      </ol>
                    ) : <p className="text-text-muted">No individual events recorded.</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
