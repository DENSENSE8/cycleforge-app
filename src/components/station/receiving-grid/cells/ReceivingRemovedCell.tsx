'use client';

import { GridCellDash } from '@/components/ui/grid-cells';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import {
  receivingDataCellClass,
  receivingDataCellHighlightStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/** Incoming recently-removed "Left because" track. */
export function ReceivingRemovedCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const face = ctx.removalFace;
  return (
    <div
      data-col="removed"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellHighlightStyle(col, ctx)}
    >
      {face ? (
        <HoverTooltip label={face.tip} focusable={false}>
          <span
            className={cn(
              'inset-chip rounded text-role-micro uppercase tracking-widest ring-1 ring-inset',
              face.className,
            )}
          >
            {face.label}
          </span>
        </HoverTooltip>
      ) : (
        <GridCellDash />
      )}
    </div>
  );
}
