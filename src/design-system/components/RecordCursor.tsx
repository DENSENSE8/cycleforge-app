'use client';

import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export interface RecordCursorModel {
  /** Context plus position, for example `Urgent · 51–73 of 73`. */
  label: string;
  previousLabel: string;
  nextLabel: string;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * One compact previous/context/next grammar for paged feeds and adjacent
 * warehouse records. It is intentionally positioning-free: the surface that
 * owns it decides whether it is in-flow or part of its single bottom dock.
 */
export function RecordCursor({
  cursor,
  className,
}: {
  cursor: RecordCursorModel;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={cursor.label}
      className={cn('grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center', className)}
    >
      <IconButton
        size="touch"
        radius="flush"
        ariaLabel={cursor.previousLabel}
        icon={<ChevronLeft className="h-5 w-5" />}
        disabled={!cursor.canPrevious}
        onClick={cursor.onPrevious}
      />
      <span className="truncate px-2 text-center text-xs font-semibold tabular-nums text-mode-muted">
        {cursor.label}
      </span>
      <IconButton
        size="touch"
        radius="flush"
        ariaLabel={cursor.nextLabel}
        icon={<ChevronRight className="h-5 w-5" />}
        disabled={!cursor.canNext}
        onClick={cursor.onNext}
      />
    </div>
  );
}
