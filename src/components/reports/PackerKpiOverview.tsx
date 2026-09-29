import type { PackingKpiSummary } from '@/lib/packing/packer-kpi-queries';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';
import { ProgressBar } from '@/design-system/primitives/ProgressBar';
import { formatDuration } from '@/lib/studio/flow-metrics';
import { cn } from '@/utils/_cn';

const countFor = (row: PackingKpiSummary['by_packer'][number]) =>
  row.small_count + row.medium_count + row.large_count;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? Math.round((ordered[middle - 1] + ordered[middle]) / 2)
    : ordered[middle];
}

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
  const units = rows.reduce((sum, row) => sum + row.quantity, 0);
  const medianPack = median(rows.flatMap((row) => row.packDurationSeconds == null ? [] : [row.packDurationSeconds]));
  const medianNext = median(rows.flatMap((row) => row.nextPackSeconds == null ? [] : [row.nextPackSeconds]));
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-sm', className)} aria-label="Packer KPI summary">
      <div className="flex items-center justify-between gap-3 border-b border-border-hairline px-4 py-3">
        <div>
          <h2 className="text-role-body font-semibold text-text-default">Packing performance</h2>
          <p className="text-role-micro text-text-soft">Completion pace compared with saved SKU standards</p>
        </div>
        <span className="rounded-full bg-surface-accent px-2.5 py-1 font-mono text-role-micro font-semibold tabular-nums text-text-accent">
          {capacityUsed}% capacity
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-border-hairline md:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
        <KpiFact label="Packs" value={summary.totals.total_boxes_packed.toLocaleString()} />
        <KpiFact label="Units" value={units.toLocaleString()} />
        <KpiFact label="Standard effort" value={`${summary.totals.weighted_minutes.toLocaleString()}m`} />
        <KpiFact label="Capacity used" value={`${capacityUsed}%`} />
        <KpiFact label="Median pack time" value={medianPack == null ? '—' : formatDuration(medianPack)} />
        <KpiFact label="Median next pack" value={medianNext == null ? '—' : formatDuration(medianNext)} />
      </div>

      <div className="border-t border-border-hairline px-4 py-3">
        <ProgressBar
          current={summary.totals.weighted_minutes}
          goal={capacity}
          label="Standard workload against available packer minutes"
          showRemaining
        />
      </div>

      <div className="grid grid-cols-3 divide-x divide-border-hairline border-t border-border-hairline bg-surface-sunken/40">
        <KpiFact label="Small" value={summary.totals.small_count.toLocaleString()} compact />
        <KpiFact label="Medium" value={summary.totals.medium_count.toLocaleString()} compact />
        <KpiFact label="Large" value={summary.totals.large_count.toLocaleString()} compact />
      </div>

      <div className="border-t border-border-hairline">
        <p className="px-3 py-2 text-role-eyebrow font-semibold text-text-soft">By packer</p>
        {summary.by_packer.length === 0 ? (
          <p className="border-t border-border-hairline px-3 py-4 text-role-caption text-text-faint">No completed packs this day.</p>
        ) : (
          <ul className="divide-y divide-border-hairline border-t border-border-hairline">
            {summary.by_packer.map((row) => {
              const utilization = Math.round((row.weighted_minutes / Math.max(1, summary.capacity.workday_minutes)) * 100);
              return (
                <li key={row.staff_id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-role-data font-semibold text-text-default">
                      {row.staff_name?.trim() || `Staff #${row.staff_id}`}
                    </span>
                    <span className="block text-role-micro text-text-soft">
                      {row.small_count} small · {row.medium_count} medium · {row.large_count} large
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-role-data font-semibold tabular-nums text-text-default">{countFor(row)} boxes</span>
                    <span className="block text-role-micro tabular-nums text-text-soft">{row.weighted_minutes} min · {utilization}% day</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {summary.fba.pending_units > 0 ? (
        <p className="border-t border-border-hairline px-3 py-2 text-role-micro text-text-soft">
          FBA pending: {summary.fba.pending_units.toLocaleString()} units · {summary.fba.pending_weighted_minutes.toLocaleString()} weighted minutes · about {summary.fba.fillable_units.toLocaleString()} fit remaining capacity.
        </p>
      ) : null}
    </section>
  );
}

function KpiFact({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={compact ? 'px-3 py-2' : 'px-3 py-3'}>
      <p className="text-role-micro text-text-soft">{label}</p>
      <p className={cn('font-mono font-semibold tabular-nums text-text-default', compact ? 'text-role-data' : 'text-lg')}>{value}</p>
    </div>
  );
}
