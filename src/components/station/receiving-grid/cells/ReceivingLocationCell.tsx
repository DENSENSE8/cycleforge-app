'use client';

import { GridCellDash } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { triageLaneLabel } from '@/lib/receiving/triage-lane-policy';
import { receivingDataCellClass, type ReceivingGridCellProps } from './receiving-grid-cell-types';

export function ReceivingLocationCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const locLabel = (ctx.row.staging_location_label || '').trim();
  const lane = triageLaneLabel(ctx.row.priority_lane);
  const tip = locLabel
    ? ctx.row.priority_lane
      ? `${locLabel} · ${lane}`
      : locLabel
    : null;
  return (
    <div data-col="location" className={receivingDataCellClass(col, rule)}>
      {locLabel ? (
        <HoverTooltip label={tip ?? locLabel} focusable={false}>
          <span className="min-w-0 truncate font-mono text-role-caption tabular-nums text-text-muted">
            {locLabel}
          </span>
        </HoverTooltip>
      ) : (
        <GridCellDash />
      )}
    </div>
  );
}
