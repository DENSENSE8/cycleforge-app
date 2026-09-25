'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FilterDropdownSelect } from '@/design-system/components/FilterDropdownSelect';
import { MOBILE_ROW_CORNER } from '@/design-system/tokens/radius';
import { formatDateKeyMedium } from '@/utils/date';
import {
  activityStaffTotals,
  activityStaffLabel,
  activityRowKey,
  eventsByActivityRow,
  fetchTaskActivityReport,
  formatActivityClock,
  formatActivityDuration,
  type TaskActivityRow,
} from '@/lib/reports/task-activity-report';

type KindFilter = 'all' | TaskActivityRow['kind'];

export function MobileTaskActivityReport({ dateKey }: { dateKey: string }) {
  const [staffId, setStaffId] = useState('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const query = useQuery({
    queryKey: ['task-activity-report', dateKey],
    queryFn: () => fetchTaskActivityReport(dateKey),
    retry: false,
    staleTime: 30_000,
  });
  const rows = query.data?.rows;
  const staff = useMemo(() => activityStaffTotals(rows ?? []), [rows]);
  const events = useMemo(() => eventsByActivityRow(query.data?.events ?? []), [query.data?.events]);
  const filtered = rows?.filter((row) =>
    (staffId === 'all' || row.staffId === Number(staffId)) && (kind === 'all' || row.kind === kind),
  ) ?? [];
  const staffTotals = activityStaffTotals(filtered);

  return (
    <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6" aria-label="Task time and activity">
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="min-w-0 flex-1 [&_select]:h-11">
          <FilterDropdownSelect
            label="Staff"
            ariaLabel="Filter activity by staff"
            value={staffId}
            onChange={setStaffId}
            emptyOption={{ value: 'all', label: 'All staff' }}
            options={staff.map((person) => ({ value: person.staffId, label: activityStaffLabel(person.staffId, person.staffName) }))}
          />
        </div>
        <div className="min-w-0 flex-1 [&_select]:h-11">
          <FilterDropdownSelect
            label="Record kind"
            ariaLabel="Filter activity by kind"
            value={kind}
            onChange={(value) => setKind(value as KindFilter)}
            emptyOption={{ value: 'all', label: 'Both kinds' }}
            options={[{ value: 'task', label: 'Tasks' }, { value: 'checklist', label: 'Checklists' }]}
          />
        </div>
      </div>
      <p className="mb-3 text-role-micro text-text-muted">Measured focus is tracked session time per staff and task. View, completion and audit interactions are timestamps, not measured work. Task lifecycle is separate, unattributed wall-clock from start to completion: not staff time or measured focus. Activity before tracking began may not appear.</p>
      {query.isPending ? <p role="status" className="py-6 text-role-caption text-text-muted">Loading activity…</p> : null}
      {query.isError ? <p role="alert" className="py-6 text-role-caption text-text-muted">{query.error.message}</p> : null}
      {query.data && filtered.length === 0 ? <p className="py-6 text-role-caption text-text-muted">No per-staff tracked task or checklist activity recorded for {formatDateKeyMedium(dateKey, { withYear: true })}{staffId !== 'all' || kind !== 'all' ? ' with these filters' : ''}. This does not mean no work occurred.</p> : null}
      {query.data ? (
        <>
          <p className="mb-2 text-role-micro text-text-muted">{filtered.length} of {rows?.length ?? 0} staff / record / day rows · warehouse time</p>
          <ul className="mb-3 space-y-2" aria-label="Measured focus by staff for the selected day">
            {staffTotals.map((total) => (
              <li key={total.staffId} className={`border border-border-hairline bg-surface-card px-3 py-2 text-role-caption text-text-default ${MOBILE_ROW_CORNER}`}>
                <strong>{activityStaffLabel(total.staffId, total.staffName)}</strong> · {total.records} {total.records === 1 ? 'record' : 'records'} · {formatActivityDuration(total.measuredFocusSeconds)} measured focus
              </li>
            ))}
          </ul>
          {kind !== 'checklist' && query.data.taskLifecycles.length > 0 ? (
            <section className="mb-3" aria-label="Task lifecycle wall-clock time for the selected day">
              <h2 className="text-role-caption font-semibold text-text-default">Task lifecycle · all staff</h2>
              <p className="mb-2 text-role-micro text-text-muted">Unmeasured task wall-clock, independent of the staff filter. Not assigned to a staffer or added to measured focus.</p>
              <ul className="space-y-2">
                {query.data.taskLifecycles.map((lifecycle) => (
                  <li key={`${lifecycle.taskId}:${lifecycle.completedAt}`} className={`border border-border-hairline bg-surface-card px-3 py-2 text-role-caption text-text-default ${MOBILE_ROW_CORNER}`}>
                    <p className="font-semibold">Task #{lifecycle.taskId} · {formatDateKeyMedium(lifecycle.date, { withYear: true })}</p>
                    <p className="text-role-micro text-text-muted">Start {formatActivityClock(lifecycle.startedAt)} · Completed {formatActivityClock(lifecycle.completedAt)}</p>
                    <p className="font-mono tabular-nums">{formatActivityDuration(lifecycle.elapsedSeconds)} lifecycle elapsed · wall clock, unmeasured</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <ul className="space-y-2">
            {filtered.map((row) => {
              const trail = events.get(activityRowKey(row)) ?? [];
              return (
                <li key={activityRowKey(row)} className={`border border-border-hairline bg-surface-card px-3 py-3 ${MOBILE_ROW_CORNER}`}>
                  <p className="text-role-caption font-semibold text-text-default">{row.title || `${row.kind === 'task' ? 'Task' : 'Checklist'} #${row.id}`}</p>
                  <p className="text-role-micro text-text-muted">{activityStaffLabel(row.staffId, row.staffName)} · {row.kind === 'task' ? 'Task' : 'Checklist'} #{row.id} · {formatDateKeyMedium(row.date, { withYear: true })}</p>
                  <dl className="mt-2 border-t border-border-hairline pt-2 text-role-caption">
                    <div><dt className="text-role-micro text-text-muted">Measured focus · this staffer</dt><dd className="font-mono tabular-nums text-text-default">{formatActivityDuration(row.measuredFocusSeconds)}</dd></div>
                  </dl>
                  <details className="mt-2 border-t border-border-hairline pt-2">
                    <summary className="min-h-11 cursor-pointer py-2 text-role-caption font-medium text-text-default">Viewed {row.viewedAt.length} · Worked {row.workedAt.length} · Completed {row.completedAt.length} · Details</summary>
                    <div className="space-y-3 pb-2 text-role-caption">
                      {([['Viewed', row.viewedAt], ['Worked', row.workedAt], ['Completed', row.completedAt]] as const).map(([label, times]) => (
                        <p key={label} className="text-text-muted"><strong className="font-medium text-text-default">{label} ({times.length}):</strong> {times.length ? times.map(formatActivityClock).join(' · ') : 'None'}</p>
                      ))}
                      <p className="font-semibold text-text-default">Event trail</p>
                      {trail.length ? (
                        <ol className="space-y-2">
                          {trail.map((event) => (
                            <li key={event.eventId} className="border-b border-border-hairline pb-1 last:border-0">
                              <span className="block capitalize text-text-default">{event.event} · {formatActivityClock(event.at)}</span>
                              <span className="block break-all text-role-micro text-text-muted">{event.source}{event.durationSeconds == null ? '' : ` · ${formatActivityDuration(event.durationSeconds)}`}</span>
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
        </>
      ) : null}
    </section>
  );
}
