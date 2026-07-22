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
}

/**
 * Secondary path strip under workbench chrome — breadcrumb + count only.
 * Search, media type, filters, sort, and display controls live in
 * {@link PhotoLibraryWorkspaceHeader}.
 */
export function PhotoLibraryHeader({ breadcrumb, metaLine }: PhotoLibraryPathStripProps) {
  return (
    <div className={cn(mainStickyHeaderClass, receivingHeaderHairlineClass, 'bg-surface-canvas/80 backdrop-blur')}>
      <div className={mainStickyHeaderCompactRowClass}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1">{breadcrumb}</div>
          <span className={`${microBadge} hidden shrink-0 truncate text-text-soft md:inline`}>
            {metaLine}
          </span>
        </div>
      </div>
    </div>
  );
}
