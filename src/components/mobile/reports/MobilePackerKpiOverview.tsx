import type { PackingKpiSummary } from '@/lib/packing/packer-kpi-queries';

const countFor = (row: PackingKpiSummary['by_packer'][number]) => row.small_count + row.medium_count + row.large_count;

export function MobilePackerKpiOverview({ summary }: { summary: PackingKpiSummary }) {
  const capacity = Math.max(1, summary.capacity.daily_capacity_minutes);
  const capacityUsed = Math.round((summary.totals.weighted_minutes / capacity) * 100);
  return (
    <section className="border-b border-mode-rule bg-mode-panel" aria-label="Packer KPI summary">
      <div className="grid grid-cols-2 divide-x divide-y divide-mode-rule">
        <Fact label="Boxes packed" value={summary.totals.total_boxes_packed.toLocaleString()} />
        <Fact label="Weighted minutes" value={summary.totals.weighted_minutes.toLocaleString()} />
        <Fact label="Capacity used" value={`${capacityUsed}%`} />
        <Fact label="Minutes remaining" value={summary.totals.remaining_minutes.toLocaleString()} />
      </div>
      <div className="grid grid-cols-3 divide-x divide-mode-rule border-t border-mode-rule">
        <Fact label="Small" value={summary.totals.small_count.toLocaleString()} compact />
        <Fact label="Medium" value={summary.totals.medium_count.toLocaleString()} compact />
        <Fact label="Large" value={summary.totals.large_count.toLocaleString()} compact />
      </div>
      <p className="border-t border-mode-rule px-mode-page py-2 text-role-eyebrow font-semibold text-mode-muted">By packer</p>
      {summary.by_packer.length === 0 ? (
        <p className="border-t border-mode-rule px-mode-page py-4 text-role-caption text-mode-muted">No completed packs this day.</p>
      ) : (
        <ul className="divide-y divide-mode-rule border-t border-mode-rule">
          {summary.by_packer.map((row) => {
            const utilization = Math.round((row.weighted_minutes / Math.max(1, summary.capacity.workday_minutes)) * 100);
            return (
              <li key={row.staff_id} className="flex items-center gap-3 px-mode-page py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-role-data font-semibold text-mode-ink">{row.staff_name?.trim() || `Staff #${row.staff_id}`}</span>
                  <span className="block text-role-micro text-mode-muted">{row.small_count} small · {row.medium_count} medium · {row.large_count} large</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-role-data font-semibold tabular-nums text-mode-ink">{countFor(row)} boxes</span>
                  <span className="block text-role-micro tabular-nums text-mode-muted">{row.weighted_minutes} min · {utilization}% day</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {summary.fba.pending_units > 0 ? (
        <p className="border-t border-mode-rule px-mode-page py-2 text-role-micro text-mode-muted">
          FBA pending: {summary.fba.pending_units.toLocaleString()} units · {summary.fba.pending_weighted_minutes.toLocaleString()} weighted minutes · about {summary.fba.fillable_units.toLocaleString()} fit remaining capacity.
        </p>
      ) : null}
    </section>
  );
}

function Fact({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={compact ? 'px-mode-page py-2' : 'px-mode-page py-3'}>
      <p className="text-role-micro text-mode-muted">{label}</p>
      <p className={compact ? 'font-mono text-role-data font-semibold tabular-nums text-mode-ink' : 'font-mono text-lg font-semibold tabular-nums text-mode-ink'}>{value}</p>
    </div>
  );
}
