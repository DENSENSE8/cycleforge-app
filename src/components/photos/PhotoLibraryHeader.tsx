'use client';

import type { ReactNode } from 'react';
import {
  mainStickyHeaderClass,
  mainStickyHeaderCompactRowClass,
  receivingHeaderHairlineClass,
} from '@/components/layout/header-shell';
import { microBadge } from '@/design-system/tokens/typography/presets';
import type { PhotoLibrarySortMode } from '@/lib/photos/library-filter-state';
import { cn } from '@/utils/_cn';
import { PhotoSortMenu } from './PhotoSortMenu';

interface PhotoLibraryHeaderProps {
  /** The date/folder breadcrumb — the surface's identity + navigation path. It
   *  scrolls internally on narrow widths, so it doubles as the title. */
  breadcrumb: ReactNode;
  /** Compact count line (e.g. "6 photos") shown as muted meta on wider screens. */
  metaLine: string;
  /** Display controls (toggle + density + refresh + select), rendered before the
   *  sort anchor — see {@link PhotoDisplayControls}. */
  controls?: ReactNode;
  sort: PhotoLibrarySortMode;
  onSortChange: (sort: PhotoLibrarySortMode) => void;
}

/**
 * Single consolidated media-library toolbar: breadcrumb (identity + path) on the
 * left, the display controls + sort anchor on the right. Sort stays pinned to the
 * far right regardless of which display controls are shown. During selection the
 * whole header is swapped for the bulk-action bar (see PhotoLibraryPage).
 */
export function PhotoLibraryHeader({
  breadcrumb,
  metaLine,
  controls,
  sort,
  onSortChange,
}: PhotoLibraryHeaderProps) {
  return (
    <div className={cn(mainStickyHeaderClass, receivingHeaderHairlineClass)}>
      <div className={mainStickyHeaderCompactRowClass}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1">{breadcrumb}</div>
          <span className={`${microBadge} hidden shrink-0 truncate text-text-soft md:inline`}>
            {metaLine}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {controls}
          {/* Sort stays pinned to the far right as the stable anchor. */}
          <PhotoSortMenu sort={sort} onSortChange={onSortChange} />
        </div>
      </div>
    </div>
  );
}
