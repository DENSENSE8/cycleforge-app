'use client';

import { ConditionGradeChip } from '@/components/ui/CopyChip';
import { useConditionGradeStyle, type ConditionGradeStyleSize } from '@/hooks/useConditionGradeStyle';

/** Small condition-grade readout. */
export function ConditionBadge({
  grade,
  size = 'compact',
}: {
  grade: string | null | undefined;
  size?: ConditionGradeStyleSize;
}) {
  const { textClass, label } = useConditionGradeStyle(grade, size);
  if (size === 'meta') {
    return <ConditionGradeChip grade={grade} />;
  }
  return <span className={textClass}>{label}</span>;
}
