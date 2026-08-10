'use client';

import type { ReactNode } from 'react';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
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
 * Band 2 of the flush sheet chrome — breadcrumb + count, with the photo-surface
 * display controls on the right.
 *
 * It is a BAND, not a card: it renders in `DashboardScrollShell`'s `chrome` slot
 * beside Band 1, so it owns no radius, no lift, and no `sticky`. Two
 * consequences, both deliberate:
 *
 *  - **`border-t-0` / `border-l-0`.** Band 1 above owns that seam and the left
 *    context rail owns the left hairline — one hairline per seam
 *    (`source-of-truth.md` → Sheets flush mount recipe).
 *  - **It left the scroll port.** While it lived in the body it was a second
 *    `sticky top-0` layer competing with the day bands' own `top-0`, which is the
 *    one-sticky-layer-per-port rule (`display/workbench-ops-queue.md`). Docking
 *    it in the chrome slot removes the competition rather than offsetting it.
 */
export function PhotoLibraryHeader({ breadcrumb, metaLine, controls }: PhotoLibraryPathStripProps) {
  return (
    <div
      className={cn(
        'flex w-full items-center justify-between gap-4 border border-l-0 border-t-0 border-border-soft bg-surface-card px-3',
        PRIMARY_CHROME_ROW_FACE,
      )}
    >
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
  );
}
