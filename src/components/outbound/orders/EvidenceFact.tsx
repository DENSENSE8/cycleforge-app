import type { ReactNode } from 'react';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { cn } from '@/utils/_cn';

/** One fact row of the Selected-order column: mono label over (or beside) its value, ruled underneath. */
export function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex min-w-0 border-b border-mode-edge', wide ? 'flex-col py-2' : 'items-center')}>
      <dt className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 text-mode-muted', !wide && 'py-2')}>{label}</dt>
      <dd className="min-w-0 flex-1 text-role-data text-mode-ink">{children}</dd>
    </div>
  );
}
