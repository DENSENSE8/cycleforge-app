'use client';

import { GridCellDash } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ReceivingChipValue } from './ReceivingChipValue';
import {
  receivingCellWantsChip,
  receivingDataCellClass,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

export function ReceivingStageCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { stageDisplay, stageTip } = ctx;
  const chip = receivingCellWantsChip(col, ctx);
  return (
    <div data-col="stage" className={receivingDataCellClass(col, rule, ctx)}>
      {stageDisplay && stageDisplay !== '--:--' ? (
        <HoverTooltip label={stageTip} focusable={false}>
          <ReceivingChipValue enabled={chip}>
            <span className="truncate tabular-nums text-role-caption text-text-muted">
              {stageDisplay}
            </span>
          </ReceivingChipValue>
        </HoverTooltip>
      ) : (
        <GridCellDash />
      )}
    </div>
  );
}
