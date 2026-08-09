'use client';

/**
 * Sticky leaf chrome — top-left history ← → + **current title** (+ optional
 * trailing perspective segment, e.g. Claim New·Link).
 *
 * Title is always the current trail segment (e.g. `PO notes`). Ancestors are
 * not painted as jump crumbs — depth is ← → / Esc / ArrowLeft·ArrowRight only.
 *
 * Never IconButton. Never a path-as-title Back row.
 */

import { useCallback, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { STATION_SECONDARY_BAND_FACE } from '@/components/layout/header-shell';
import { STATION_CHROME_SEAM_HAIRLINE } from '@/components/station/entity-context';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { DisplaysBreadcrumbSegment } from './displays-leaf-chrome';

const HISTORY_BTN =
  'inline-flex h-full w-6 shrink-0 items-center justify-center text-text-soft ' +
  'hover:bg-surface-sunken hover:text-text-default ' +
  'disabled:pointer-events-none disabled:opacity-30 ' +
  `${focusRing('control', 'accent')} outline-none`;

export function StationDisplayLeafHeader({
  title,
  segments,
  onBack,
  onForward,
  backLabel = 'Back to Displays',
  forwardLabel = 'Forward',
  canGoBack = true,
  canGoForward = false,
  trailing = null,
}: {
  /** Legacy single-segment alias — prefer {@link segments}. */
  title?: string;
  /** Trail (min 1). Last segment is the painted title. */
  segments?: DisplaysBreadcrumbSegment[];
  onBack: () => void;
  /** Visit / nested Forward — omitted when the host has no forward stack. */
  onForward?: () => void;
  /** Tooltip / aria for the Back chevron + ArrowLeft. */
  backLabel?: string;
  forwardLabel?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  /**
   * Leaf-wide child perspective (Claim New·Link). End of the same h-6 band —
   * never a second sticky row.
   */
  trailing?: ReactNode;
}) {
  const trail: DisplaysBreadcrumbSegment[] =
    segments && segments.length > 0
      ? segments
      : title
        ? [{ id: 'leaf', label: title }]
        : [];

  const current = trail.length > 0 ? trail[trail.length - 1]! : null;

  const onBandKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowLeft') {
        if (!canGoBack) return;
        e.preventDefault();
        e.stopPropagation();
        onBack();
        return;
      }
      if (e.key === 'ArrowRight') {
        if (!canGoForward || !onForward) return;
        e.preventDefault();
        e.stopPropagation();
        onForward();
      }
    },
    [canGoBack, canGoForward, onBack, onForward],
  );

  return (
    <div
      role="toolbar"
      aria-label="Displays navigation"
      tabIndex={0}
      onKeyDown={onBandKeyDown}
      className={cn(
        // 24px eyebrow band — same STATION_SECONDARY_BAND_FACE (h-6) seam as the
        // Displays index group eyebrows, the left-rail eyebrow, and carton
        // commerce row 2. Never a page-local h-10 chrome band.
        // Sticky at z-base — below the inset resize sash (z-sticky) so ← → /
        // title / this hairline never steal the left-edge drag. Column top
        // band stays z-header so →| / fullscreen remain above the sash.
        // Hairline via STATION_CHROME_SEAM_HAIRLINE — not border-b (avoids
        // notching the column border-l).
        'sticky top-0 z-base flex w-full items-stretch bg-surface-card',
        STATION_SECONDARY_BAND_FACE,
        STATION_CHROME_SEAM_HAIRLINE,
        focusRing('control', 'accent'),
        'outline-none',
      )}
      data-station-displays-leaf-header=""
      data-breadcrumb-depth={trail.length}
      data-testid="station-displays-leaf-nav"
    >
      <HoverTooltip label={backLabel} asChild>
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label={backLabel}
          className={HISTORY_BTN}
          data-testid="station-displays-history-back"
          data-station-displays-back=""
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      </HoverTooltip>
      <HoverTooltip label={forwardLabel} asChild>
        <button
          type="button"
          onClick={onForward}
          disabled={!canGoForward || !onForward}
          aria-label={forwardLabel}
          className={cn(HISTORY_BTN, 'border-r border-border-hairline')}
          data-testid="station-displays-history-forward"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </HoverTooltip>

      <div
        className="flex min-w-0 flex-1 items-center px-2"
        data-station-displays-breadcrumb=""
      >
        {current ? (
          <span
            className="min-w-0 truncate text-role-caption font-semibold text-text-default"
            data-station-displays-leaf-title=""
            data-breadcrumb-segment={current.id}
            data-breadcrumb-kind="current"
            aria-current="page"
          >
            {current.label}
          </span>
        ) : null}
      </div>

      {trailing != null ? (
        <div
          className="flex h-full shrink-0 items-stretch py-0 pr-0.5"
          data-station-displays-leaf-trailing=""
          data-testid="station-displays-leaf-trailing"
        >
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
