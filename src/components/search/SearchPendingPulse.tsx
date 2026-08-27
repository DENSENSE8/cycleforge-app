'use client';

/**
 * SearchPendingBar — indeterminate bottom-rule loader for find chrome.
 *
 * Not an `animate-pulse` blob and not a second elevated panel under the field.
 * Same sweep as receive/unfound long-running work (`recv-indet-bar`): a thin
 * bar along the field's bottom edge while resolve / retrieve runs.
 */

import { cn } from '@/utils/_cn';

export function SearchPendingBar({
  className,
  /** `absolute` = pin to find-cell bottom; `flow` = in-document strip. */
  edge = 'absolute',
}: {
  className?: string;
  edge?: 'absolute' | 'flow';
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Searching"
      className={cn(
        // Track must `overflow-hidden` so the recv-indet sweep stays inside the
        // 2px rule (same recipe as StationScanBar submit trace).
        'pointer-events-none z-raised h-0.5 overflow-hidden bg-surface-strong/50',
        edge === 'absolute' ? 'absolute inset-x-0 bottom-0' : 'relative w-full',
        className,
      )}
      data-testid="search-pending-bar"
    >
      <div className="recv-indet-bar h-full w-1/3 bg-blue-500" />
    </div>
  );
}
