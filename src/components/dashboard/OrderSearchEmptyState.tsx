'use client';

import { motion, motionRole, useMotionRole } from '@/design-system/motion';

import { Search } from '@/components/Icons';
import { sectionLabel } from '@/design-system';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

interface OrderSearchEmptyStateProps {
  query: string;
  title?: string;
  resultLabel?: string;
  clearLabel?: string;
  onClear: () => void;
}

/** Search "no-results" teaching box (Workbench empty state). */
export function OrderSearchEmptyState({
  query,
  title = 'Order not found',
  resultLabel = 'records',
  clearLabel = 'Show All Orders',
  onClear,
}: OrderSearchEmptyStateProps) {
  // `motionRole.swap.focus` — the pointer-driven focus-surface swap, taken as
  // one pair so the presence can never drift onto another job's timing.
  const { presence: presence, transition: transition } = useMotionRole(motionRole.swap.focus);

  return (
    <motion.div
      {...presence}
      transition={transition}
      className={cn(
        'mx-auto max-w-xs border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center',
        cornerClass('flush'),
      )}
    >
      <div
        className={cn(
          'mx-auto mb-3 flex h-11 w-11 items-center justify-center bg-surface-sunken',
          cornerClass('pill'),
        )}
      >
        <Search className="h-5 w-5 text-text-faint" />
      </div>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-tight text-text-default">{title}</h3>
      <p className="text-role-micro uppercase leading-relaxed tracking-widest text-text-muted">
        No {resultLabel} match &quot;{query}&quot;
      </p>
      <Button
        type="button"
        variant="brand"
        onClick={onClear}
        className={`mt-5 bg-none bg-surface-inverse px-6 ${sectionLabel} text-white hover:bg-surface-inverse-hover`}
      >
        {clearLabel}
      </Button>
    </motion.div>
  );
}
