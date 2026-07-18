'use client';

import { KpiTile } from '@/design-system/components/monitor';
import type { ReadyWorkspaceCounts } from './ReadyWorkspaceHeader';
import type { ReadyWorkspaceTab } from '@/utils/ready-workspace-state';

const TILE_BAND_CLASS = 'flex flex-wrap gap-3';
const TILE_CELL_CLASS = 'min-w-0 grow basis-32';

export function ReadyKpiStrip({
  counts,
  activeTab,
  onSelectTab,
}: {
  counts: ReadyWorkspaceCounts;
  activeTab: ReadyWorkspaceTab;
  onSelectTab: (tab: ReadyWorkspaceTab) => void;
}) {
  const metrics: Array<{
    id: string;
    label: string;
    value: number;
    tab?: ReadyWorkspaceTab;
    valueClassName?: string;
  }> = [
    { id: 'all', label: 'Recently tested', value: counts.all, tab: 'all' },
    {
      id: 'fba',
      label: 'Ready for FBA',
      value: counts.fba,
      tab: 'fba',
      valueClassName: 'text-text-fulfillment',
    },
    {
      id: 'prebox',
      label: 'Pre-box & stock',
      value: counts.prebox,
      tab: 'prebox',
      valueClassName: 'text-text-success',
    },
    {
      id: 'hold',
      label: 'Hold',
      value: counts.hold,
      tab: 'hold',
      valueClassName: 'text-text-warning',
    },
    { id: 'staged', label: 'Already staged', value: counts.staged },
  ];

  return (
    <div className={TILE_BAND_CLASS}>
      {metrics.map((metric) => (
        <div key={metric.id} className={TILE_CELL_CLASS}>
          <KpiTile
            label={metric.label}
            value={metric.value}
            valueClassName={metric.valueClassName}
            active={metric.tab === activeTab}
            onOpen={metric.tab ? () => onSelectTab(metric.tab as ReadyWorkspaceTab) : undefined}
            className="h-full"
          />
        </div>
      ))}
    </div>
  );
}
