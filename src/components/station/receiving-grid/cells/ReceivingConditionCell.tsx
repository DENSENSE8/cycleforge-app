'use client';

import { GridCellDash } from '@/components/ui/grid-cells';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { isEmptyMetaDash } from '@/lib/conditions';
import { cn } from '@/utils/_cn';
import { ReceivingChipValue } from './ReceivingChipValue';
import {
  receivingCellWantsChip,
  receivingDataCellClass,
  receivingDataCellHighlightStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

export function ReceivingConditionCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { condGrade, conditionLabel } = ctx;
  const chip = receivingCellWantsChip(col, ctx);
  const empty = isEmptyMetaDash(conditionLabel);
  return (
    <div data-col="condition" className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellHighlightStyle(col, ctx)}>
      {empty ? (
        <GridCellDash />
      ) : (
        <ReceivingChipValue enabled={chip}>
          <span
            className={cn(
              'min-w-0 truncate text-role-eyebrow uppercase',
              conditionGradeTextClass(condGrade),
            )}
          >
            {conditionLabel}
          </span>
        </ReceivingChipValue>
      )}
    </div>
  );
}
