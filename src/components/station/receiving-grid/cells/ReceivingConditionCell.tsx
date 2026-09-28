'use client';

import { GridCellDash } from '@/components/ui/grid-cells';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { isEmptyMetaDash } from '@/lib/conditions';
import { cn } from '@/utils/_cn';
import {
  receivingDataCellClass,
  receivingDataCellStyle,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

export function ReceivingConditionCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { condGrade, conditionLabel } = ctx;
  const empty = isEmptyMetaDash(conditionLabel);
  return (
    <div data-col="condition" className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}>
      {empty ? (
        <GridCellDash />
      ) : (
        <span
          className={cn(
            'min-w-0 truncate text-role-eyebrow',
            conditionGradeTextClass(condGrade),
          )}
        >
          {conditionLabel}
        </span>
      )}
    </div>
  );
}
