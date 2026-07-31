'use client';

import { GridCellDash } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { receivingDataCellClass, type ReceivingGridCellProps } from './receiving-grid-cell-types';

export function ReceivingStageCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { stageDisplay, stageTip } = ctx;
  return (
    <div data-col="stage" className={receivingDataCellClass(col, rule)}>
      {stageDisplay && stageDisplay !== '--:--' ? (
        <HoverTooltip label={stageTip} focusable={false}>
          {/* `text-muted`, not `faint`: this is the stamp an operator reads
              when adjudicating "when was this unboxed, and by whom". At
              `faint` it dropped out entirely on a warehouse monitor viewed
              from a few feet — the quietest value on the row was the one
              the column exists to show. */}
          <span className="truncate tabular-nums text-role-caption text-text-muted">
            {stageDisplay}
          </span>
        </HoverTooltip>
      ) : (
        <GridCellDash />
      )}
    </div>
  );
}
