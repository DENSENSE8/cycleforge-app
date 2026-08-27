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
        // `pl-3 pr-0`, not `px-3`: the breadcrumb keeps its reading inset, and
        // the control cells run to the band's own right edge. A trailing pad
        // parked the last cell 13px inside the row while Band 2's cluster
        // above it sat flush — two rows of chrome disagreeing about where the
        // right edge is.
        'flex w-full items-center justify-between gap-4 border border-l-0 border-t-0 border-border-soft bg-surface-card pl-3 pr-0',
        PRIMARY_CHROME_ROW_FACE,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="min-w-0 flex-1">{breadcrumb}</div>
        {/*
          `data-testid`, because six specs used to assert this readout by
          regexing its copy (`/Photos \d+ ·/`) — a matcher that had to be
          disambiguated from the end-of-stream footer's own count, and that
          broke every one of them the first time the wording was improved. A
          test should pin that the count is SHOWN, not how it is phrased.
        */}
        <span
          data-testid="photo-library-meta"
          className={cn(microBadge, 'hidden shrink-0 truncate text-text-soft md:inline')}
        >
          {metaLine}
        </span>
      </div>

      {/*
        ONE continuous strip of cells — no gap anywhere, at any level.

        `items-stretch` + `self-stretch`, not `items-center`: every control here
        is a full-height band CELL that tracks the 28px row. Centering them let
        a 32px refresh and a 34px bordered group sit taller than the band they
        lived in.

        `[&>*+*]:-ml-px` collapses the seam BETWEEN groups, exactly as
        `mediaBandCellGroupClass` already collapses it between the cells inside
        one. The groups survive for their `role="group"` semantics (Grid size,
        Photo display are each a set), but they are not a visual rhythm — a gap
        between them read as three floating clusters rather than one strip, and
        it was the last of the three competing rhythms this row used to carry
        (`p-0.5` inside, `gap-1` around, `gap-1.5` between).
      */}
      {controls ? (
        <div className="flex shrink-0 items-stretch self-stretch [&>*+*]:-ml-px">{controls}</div>
      ) : null}
    </div>
  );
}
