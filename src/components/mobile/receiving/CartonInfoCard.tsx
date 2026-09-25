'use client';

import { DetailSummaryCard } from '@/design-system/components/DetailSummaryCard';
import { cartonStage, cartonTitle, type CartonHubData } from '@/lib/receiving/carton-hub';
import { workflowStageBadge, workflowStageLabel } from '@/lib/receiving/workflow-stages';

/**
 * The carton hub's read-only summary on {@link DetailSummaryCard}: what's in
 * the box, tracking · carrier, line / unit progress, `R-id` bottom-left and the
 * carton's stage (its slowest line) bottom-right. The whole card opens `/info`.
 */
export function CartonInfoCard({ data }: { data: CartonHubData }) {
  const { receiving: carton, totals } = data;
  const stage = cartonStage(data.lines);
  const shipping = [carton.tracking, carton.carrier].filter(Boolean).join(' · ');
  return (
    <DetailSummaryCard
      href={`/m/r/${carton.id}/info`}
      ariaLabel="Carton details"
      title={cartonTitle(data)}
      lines={[
        { text: shipping || 'No tracking on this carton' },
        {
          text: `${totals.lines_complete}/${totals.lines} lines done · ${totals.received}/${totals.expected || '?'} units`,
          muted: true,
        },
      ]}
      foot={`R-${carton.id}`}
      chip={{ label: workflowStageLabel(stage), className: workflowStageBadge(stage) }}
    />
  );
}
