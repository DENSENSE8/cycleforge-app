'use client';

/**
 * Locations Band 2 — KPI tiles for the Bins tab (clickable status filters).
 * Flush sheet chrome: owns the bottom hairline under the KPI strip.
 */

import { KpiTile, OpsKpiBand, OpsKpiBandCell } from '@/design-system/components/monitor';
import type { BinsOverviewCounts } from '@/hooks/useBinsOverview';
import type { BinFilterStatus } from '@/components/warehouse/BinsFilterBar';

export function LocationsBinsKpiBand({
  counts,
  status,
  onSelectStatus,
}: {
  counts: BinsOverviewCounts;
  status: BinFilterStatus;
  onSelectStatus: (status: BinFilterStatus) => void;
}) {
  const tiles: Array<{
    id: BinFilterStatus;
    label: string;
    value: number;
    valueClassName?: string;
  }> = [
    { id: 'all', label: 'All bins', value: counts.total },
    { id: 'empty', label: 'Empty', value: counts.empty },
    {
      id: 'low',
      label: 'Low',
      value: counts.low_stock,
      valueClassName: 'text-text-warning',
    },
    {
      id: 'over',
      label: 'Over cap',
      value: counts.over_capacity,
      valueClassName: 'text-text-danger',
    },
    {
      id: 'stale',
      label: 'Stale',
      value: counts.stale,
      valueClassName: 'text-violet-700',
    },
  ];

  return (
    <div className="border-b border-r border-border-soft bg-surface-card px-3 py-2">
      <OpsKpiBand>
        {tiles.map((tile) => (
          <OpsKpiBandCell key={tile.id}>
            <KpiTile
              label={tile.label}
              value={tile.value}
              valueClassName={tile.valueClassName}
              active={status === tile.id}
              onOpen={() => onSelectStatus(tile.id)}
              className="h-full"
            />
          </OpsKpiBandCell>
        ))}
      </OpsKpiBand>
    </div>
  );
}
