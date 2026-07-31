'use client';

import { conditionGradeTextClass } from '@/lib/condition-tone';
import { EMPTY_META_DASH, EMPTY_META_DASH_ALIGN_CLASS } from '@/lib/conditions';
import { cn } from '@/utils/_cn';
import { receivingDataCellClass, type ReceivingGridCellProps } from './receiving-grid-cell-types';

export function ReceivingConditionCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { condGrade, conditionLabel } = ctx;
  return (
    <div data-col="condition" className={receivingDataCellClass(col, rule)}>
      <span
        className={cn(
          'min-w-0 truncate text-role-eyebrow uppercase',
          conditionGradeTextClass(condGrade),
          conditionLabel === EMPTY_META_DASH && EMPTY_META_DASH_ALIGN_CLASS,
        )}
      >
        {conditionLabel}
      </span>
    </div>
  );
}
