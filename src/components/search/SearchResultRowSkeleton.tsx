'use client';

/**
 * SearchResultRowSkeleton — loading placeholder for comfortable SearchResultRow.
 * Uses the same CSS Grid tracks as the live row so data arrival does not reflow.
 */

import { SkeletonBase } from '@/design-system/components/Skeletons';
import { SEARCH_RESULT_GRID, SEARCH_RESULT_ROW_PAD } from './search-result-grid';
import { cn } from '@/utils/_cn';

export function SearchResultRowSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(SEARCH_RESULT_GRID, SEARCH_RESULT_ROW_PAD, className)}
      aria-hidden
    >
      {/* Entity — tile + micro label */}
      <span className="flex items-center gap-1.5">
        <SkeletonBase width={36} height={36} className="rounded-lg" />
        <SkeletonBase width={36} height={10} />
      </span>

      {/* Match — title + subtitle */}
      <span className="flex min-w-0 flex-col gap-1.5">
        <SkeletonBase width="70%" height={14} />
        <SkeletonBase width="45%" height={10} />
      </span>

      {/* Status */}
      <SkeletonBase width={72} height={20} className="rounded" />

      {/* Condition */}
      <SkeletonBase width={48} height={20} className="rounded" />

      {/* Reference */}
      <SkeletonBase width={96} height={20} className="rounded" />

      {/* Platform */}
      <span className="flex justify-center">
        <SkeletonBase width={20} height={20} circle />
      </span>

      {/* Age */}
      <span className="flex justify-end">
        <SkeletonBase width={40} height={10} />
      </span>
    </div>
  );
}
