'use client';

/** The day's roster report — who still owes checks. */

import type { DailyCheckReport, DailyCheckStaffRow } from '@/lib/daily-checks/types';
import { Panel } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
      <div
        className={cn(
          'h-full rounded-full transition-[width]',
          done === total && total > 0 ? 'bg-emerald-500' : 'bg-blue-500',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ReportRow({ row, isViewer }: { row: DailyCheckStaffRow; isViewer: boolean }) {
  const complete = row.total > 0 && row.doneCount === row.total;
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          complete ? 'bg-emerald-500' : row.doneCount === 0 ? 'bg-surface-inverse-soft' : 'bg-amber-500',
        )}
      />
      <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
        {row.name}
        {isViewer ? <span className="ml-1.5 text-text-soft">(you)</span> : null}
      </span>
      <ProgressBar done={row.doneCount} total={row.total} />
      <span className="w-14 shrink-0 text-right text-role-caption tabular-nums text-text-muted">
        {row.doneCount} / {row.total}
      </span>
    </div>
  );
}

export function DailyCheckReportPanel({
  report,
  heading,
}: {
  report: DailyCheckReport;
  heading: string;
}) {
  return (
    <Panel radius="2xl" padding="none" data-testid="daily-report">
      <div className="flex items-center justify-between border-b border-border-hairline px-4 py-2">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{heading}</p>
        <span className="text-role-caption tabular-nums text-text-muted">
          {report.totalDone} of {report.totalPossible} checks done
        </span>
      </div>
      {report.staff.length === 0 ? (
        <div className="px-4 py-8 text-center text-role-caption text-text-muted">
          No staff on the roster yet.
        </div>
      ) : (
        <div className="divide-y divide-border-hairline">
          {report.staff.map((row) => (
            <ReportRow key={row.staffId} row={row} isViewer={row.staffId === report.mine.staffId} />
          ))}
        </div>
      )}
    </Panel>
  );
}
