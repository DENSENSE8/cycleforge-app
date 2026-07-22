'use client';

import type { ReactNode } from 'react';
import {
  mainStickyHeaderClass,
  mainStickyHeaderCompactRowClass,
  receivingHeaderHairlineClass,
} from '@/components/layout/header-shell';
import { microBadge } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';

interface PhotoLibraryPathStripProps {
  /** Date/folder breadcrumb — path identity while drilling. */
  breadcrumb: ReactNode;
  /** Compact count line (e.g. "6 photos") shown as muted meta on wider screens. */
  metaLine: string;
  /**
   * In-folder photo actions (density · refresh · select · icons/list) — stay on
   * this path strip, not the workbench chrome. Sort / media type / filters live
   * in {@link PhotoLibraryWorkspaceHeader}.
   */
  controls?: ReactNode;
}

/**
 * Secondary path strip under workbench chrome — breadcrumb + count, with
 * photo-surface display controls on the right when viewing photos.
 */
export function PhotoLibraryHeader({ breadcrumb, metaLine, controls }: PhotoLibraryPathStripProps) {
  return (
    <div className={cn(mainStickyHeaderClass, receivingHeaderHairlineClass, 'bg-surface-canvas/80 backdrop-blur')}>
      <div className={mainStickyHeaderCompactRowClass}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1">{breadcrumb}</div>
          <span className={`${microBadge} hidden shrink-0 truncate text-text-soft md:inline`}>
            {metaLine}
          </span>
        </div>

        {controls ? (
          <div className="flex shrink-0 items-center gap-1.5">{controls}</div>
        ) : null}
      </div>
    </div>
  );
}
