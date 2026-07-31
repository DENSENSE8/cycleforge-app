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
      {/* Glyph */}
      <span className="flex justify-center">
        <SkeletonBase width={14} height={14} className="rounded" />
      </span>

      {/* Id — OrderIdChip last-4 */}
      <SkeletonBase width={44} height={14} className="rounded" />

      {/* Match — title only */}
      <SkeletonBase width="70%" height={12} />

      {/* Tracking */}
      <SkeletonBase width={52} height={14} className="rounded" />

      {/* Age */}
      <span className="flex justify-end">
        <SkeletonBase width={24} height={8} />
      </span>
    </div>
  );
}
