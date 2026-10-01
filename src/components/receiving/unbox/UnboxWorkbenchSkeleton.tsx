'use client';

/** Shared Unbox browse-table skeleton for Suspense and dynamic fallbacks. */

import { SkeletonList } from '@/design-system/components/Skeletons';
import { cn } from '@/utils/_cn';

const TABLE_ROW_COUNT = 8;

/** Flush sheet skeleton + house row skeletons (chunk / Suspense fallback). */
export function UnboxTableCardSkeleton() {
  return (
    <div
      className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', 'overflow-hidden bg-surface-card')}
      aria-busy="true"
    >
      <div className="p-3">
        <SkeletonList count={TABLE_ROW_COUNT} type="row" />
      </div>
    </div>
  );
}
