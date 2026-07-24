'use client';

import type { ReactNode } from 'react';
import { Panel } from '@/design-system/primitives';
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
 * Secondary path bar under workbench chrome — raised card shell with breadcrumb
 * + count, and photo-surface display controls on the right when viewing photos.
 */
export function PhotoLibraryHeader({ breadcrumb, metaLine, controls }: PhotoLibraryPathStripProps) {
  return (
    <Panel
      padding="none"
      radius="xl"
      elevation="sm"
      className="sticky top-0 z-header mb-3"
    >
      <div className="flex h-10 items-center justify-between gap-4 px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1">{breadcrumb}</div>
          <span className={cn(microBadge, 'hidden shrink-0 truncate text-text-soft md:inline')}>
            {metaLine}
          </span>
        </div>

        {controls ? (
          <div className="flex shrink-0 items-center gap-1.5">{controls}</div>
        ) : null}
      </div>
    </Panel>
  );
}
