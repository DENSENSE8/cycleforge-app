'use client';

import { KpiTile, OpsKpiBand, OpsKpiBandCell } from '@/design-system/components/monitor';
import type {
  ReadyWorkspaceCounts,
  ReadyWorkspaceTab,
} from '@/utils/ready-workspace-state';

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
    <OpsKpiBand aria-label="Ready to pack metrics">
      {metrics.map((metric) => (
        <OpsKpiBandCell key={metric.id} compact>
          <KpiTile
            label={metric.label}
            value={metric.value}
            valueClassName={metric.valueClassName}
            active={metric.tab === activeTab}
            onOpen={metric.tab ? () => onSelectTab(metric.tab as ReadyWorkspaceTab) : undefined}
            className="h-full"
          />
        </OpsKpiBandCell>
      ))}
    </OpsKpiBand>
  );
}
