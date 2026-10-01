'use client';

import { ChevronRight } from '@/components/Icons';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { conditionGradeTableLabel } from '@/lib/conditions';
import { qcUnitStage } from '@/lib/qc/unit-qc-stage';
import { cn } from '@/utils/_cn';
import type { HandlingUnitMemberRead } from './useHandlingUnit';

const STAGE = {
  received: { label: 'To check', dot: 'bg-text-faint' },
  graded: { label: 'To check', dot: 'bg-amber-500' },
  testing: { label: 'In QC', dot: 'bg-blue-500' },
  passed: { label: 'Passed', dot: 'bg-emerald-500' },
  failed: { label: 'Hold', dot: 'bg-rose-500' },
  labeled: { label: 'Labeled', dot: 'bg-emerald-500' },
  putAway: { label: 'Stocked', dot: 'bg-emerald-500' },
  ticket: { label: 'Ticketed', dot: 'bg-rose-500' },
  past: { label: 'Complete', dot: 'bg-emerald-500' },
} as const;

export function HandlingUnitMemberRow({ unit, onOpen }: { unit: HandlingUnitMemberRead; onOpen: () => void }) {
  const stage = qcUnitStage(unit.current_status);
  const face = STAGE[stage];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid min-h-14 w-full grid-cols-[1.25rem_minmax(0,1fr)_auto_1rem] items-center gap-2 border-b border-mode-rule bg-mode-panel px-mode-page py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-accent"
      data-testid="handling-unit-member-row"
    >
      <span className={cn('h-2.5 w-2.5 justify-self-center rounded-full', face.dot)} aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-mode-ink">{unit.sku || 'Unknown SKU'}</span>
        <span className="block truncate font-mono text-[11px] leading-4 text-mode-muted">{unit.serial_number}</span>
      </span>
      <span className="text-right">
        <span className={cn('block text-xs font-semibold', stage === 'failed' || stage === 'ticket' ? 'text-rose-600' : 'text-mode-ink')}>{face.label}</span>
        {unit.condition_grade ? <span className={cn('block text-[10px]', conditionGradeTextClass(unit.condition_grade))}>{conditionGradeTableLabel(unit.condition_grade)}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 text-mode-muted" />
    </button>
  );
}
