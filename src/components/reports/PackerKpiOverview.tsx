import type { PackingKpiSummary } from '@/lib/packing/packer-kpi-queries';
import {
  packingPerformanceSnapshot,
  type PackingReportRow,
} from '@/lib/packing/packing-report-shared';
import { ProgressBar } from '@/design-system/primitives/ProgressBar';
import { formatDuration } from '@/lib/studio/flow-metrics';
import { cn } from '@/utils/_cn';

const countFor = (row: PackingKpiSummary['by_packer'][number]) =>
  row.small_count + row.medium_count + row.large_count;

export function PackerKpiOverview({
  summary,
  rows = [],
  className,
}: {
  summary: PackingKpiSummary;
  rows?: readonly PackingReportRow[];
  className?: string;
}) {
  const capacity = Math.max(1, summary.capacity.daily_capacity_minutes);
  const capacityUsed = Math.round((summary.totals.weighted_minutes / capacity) * 100);
  const performance = packingPerformanceSnapshot(rows);
  const coverage = Math.round(performance.measurementCoverage * 100);
  return (
    <section className={cn('overflow-hidden rounded-3xl border border-border-soft bg-surface-card p-5 shadow-sm', className)} aria-label="Packer KPI summary">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-default">Packing performance</h2>
          <p className="mt-1 text-sm leading-5 text-text-soft">Completion pace compared with saved SKU standards</p>
        </div>
        <span className="rounded-full bg-surface-accent px-3 py-1.5 text-sm font-semibold tabular-nums text-text-accent">
          {capacityUsed}% capacity
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
        <KpiFact label="Packs" value={summary.totals.total_boxes_packed.toLocaleString()} />
        <KpiFact label="Units" value={performance.units.toLocaleString()} />
        <KpiFact label="Median pack" value={performance.medianPackSeconds == null ? '—' : formatDuration(performance.medianPackSeconds)} />
        <KpiFact label="Measured" value={`${performance.measuredPackCount} · ${coverage}%`} />
      </div>

      <div className="mt-5">
        <ProgressBar
          current={summary.totals.weighted_minutes}
          goal={capacity}
          label="Standard workload against available packer minutes"
          showRemaining
        />
        <p className="mt-2 text-sm leading-5 text-text-soft">
          Standard effort is planned SKU effort. Median pack is observed time and covers {performance.measuredPackCount} of {rows.length} completions.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-surface-sunken/60 px-3 py-2 text-sm text-text-soft">
        <span><strong className="tabular-nums text-text-default">{summary.totals.small_count.toLocaleString()}</strong> small</span>
        <span><strong className="tabular-nums text-text-default">{summary.totals.medium_count.toLocaleString()}</strong> medium</span>
        <span><strong className="tabular-nums text-text-default">{summary.totals.large_count.toLocaleString()}</strong> large</span>
        <span><strong className="tabular-nums text-text-default">{performance.medianNextPackSeconds == null ? '—' : formatDuration(performance.medianNextPackSeconds)}</strong> median next pack</span>
      </div>

      <div className="mt-5 border-t border-border-hairline pt-3">
        <p className="pb-2 text-role-eyebrow font-semibold text-text-soft">By packer</p>
        {summary.by_packer.length === 0 ? (
          <p className="py-4 text-role-caption text-text-faint">No completed packs this day.</p>
        ) : (
          <ul className="divide-y divide-border-hairline">
            {summary.by_packer.map((row) => {
              const utilization = Math.round((row.weighted_minutes / Math.max(1, summary.capacity.workday_minutes)) * 100);
              return (
                <li key={row.staff_id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-text-default">
                      {row.staff_name?.trim() || `Staff #${row.staff_id}`}
                    </span>
                    <span className="block text-sm text-text-soft">
                      {row.small_count} small · {row.medium_count} medium · {row.large_count} large
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums text-text-default">{countFor(row)} boxes</span>
                    <span className="block text-sm tabular-nums text-text-soft">{row.weighted_minutes} min · {utilization}% day</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {summary.fba.pending_units > 0 ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900">
          FBA pending: {summary.fba.pending_units.toLocaleString()} units · {summary.fba.pending_weighted_minutes.toLocaleString()} weighted minutes · about {summary.fba.fillable_units.toLocaleString()} fit remaining capacity.
        </p>
      ) : null}
    </section>
  );
}

function KpiFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-text-soft">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-text-default">{value}</p>
    </div>
  );
}
