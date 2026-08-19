'use client';

/**
 * Displays nav cluster — history `← →` + **current title** (+ optional trailing
 * perspective segment, e.g. Claim New·Link).
 *
 * **In-band since 2026-08-18.** This was its own sticky `h-6` row under the
 * column's top band; it is now the LEFT group of that single band
 * (`[< >] Displays ……… [verbs] [⤢] [→|]`). Merging the two rows recovers a
 * whole row of vertical space above the index — which on a bench is the
 * difference between seeing the first VERIFICATION rows and scrolling for them
 * — and it separates "where am I" (left) from "what can I do" (right) on one
 * axis instead of two stacked ones.
 *
 * It renders no background, no hairline, and no sticky positioning: the band
 * owns all three. Height is `h-full` so it fills the band rather than setting
 * its own.
 *
 * **There is no Forward BUTTON (2026-08-18).** A `>` twin sat disabled on
 * essentially every frame an operator sees — you only have a forward stack
 * after going back, which on a scan bench is rare — so it spent a permanent
 * cell to render `opacity-30` almost always, next to the one control here that
 * matters. Forward itself is NOT removed: `ArrowRight` still walks the future
 * stack while the Right keyboard region owns, which is the documented Displays
 * history chord. That is a working chord with no advertised affordance, which
 * is the safe direction — the banned shape is the reverse, a hint for a chord
 * that does nothing.
 *
 * Title is always the current trail segment (e.g. `PO notes`). Ancestors are
 * not painted as jump crumbs — depth is ← → / Esc / ArrowLeft·ArrowRight only.
 *
 * Never IconButton. Never a path-as-title Back row.
 */

import { useCallback, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import type { DisplaysBreadcrumbSegment } from './displays-leaf-chrome';

/**
 * History Back — re-enable hits on the pointer-events-none band. Enabled ink is
 * `text-text-default`; the disabled face (`opacity-30` + soft) now only shows
 * at the very start of a session, since the forward twin is gone.
 */
const HISTORY_BTN =
  'pointer-events-auto inline-flex h-full w-6 shrink-0 items-center justify-center ' +
  'text-text-default hover:bg-surface-sunken ' +
  'disabled:pointer-events-none disabled:opacity-30 disabled:text-text-soft ' +
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
        // LEFT group of the column's single header band. The band owns the
        // height, background, hairline and stacking — this cluster owns none of
        // them, or it would double-paint the seam it used to draw itself.
        //
        // `pointer-events-none` + per-control re-enable is inherited from the
        // band: the inset resize sash (`z-sticky`, full-height `w-3`) sits under
        // this chrome, and an opaque cluster ate the leading 12px of the Back
        // chevron — it looked disabled. The empty title gutter still passes the
        // sash through for a T-junction drag.
        'pointer-events-none flex h-full min-w-0 flex-1 items-stretch',
        focusRing('control', 'accent'),
        'outline-none',
      )}
      data-station-displays-leaf-header=""
      data-breadcrumb-depth={trail.length}
      data-testid="station-displays-leaf-nav"
    >
      {/* `ml-1` clears the Displays elevated sash hairline (4px) so ← does not
          read as half-dead under the seam paint. Hit re-enable stays on the
          button; the sash grab zone is still the leading w-3 under chrome. */}
      <HoverTooltip label={backLabel} asChild>
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label={backLabel}
          className={cn(HISTORY_BTN, 'ml-1 border-r border-border-hairline')}
          data-testid="station-displays-history-back"
          data-station-displays-back=""
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      </HoverTooltip>

      <div
        className="flex min-w-0 flex-1 items-stretch"
        data-station-displays-breadcrumb=""
      >
        {current ? (
          <button
            type="button"
            onClick={onBack}
            disabled={!canGoBack}
            aria-label={backLabel}
            className={cn(
              'pointer-events-auto min-w-0 flex-1 truncate px-2 text-left text-role-caption font-semibold text-text-default',
              'hover:bg-surface-sunken',
              'disabled:pointer-events-none disabled:text-text-default',
              focusRing('control', 'accent'),
              'outline-none',
            )}
            data-station-displays-leaf-title=""
            data-testid="station-displays-leaf-title"
            data-breadcrumb-segment={current.id}
            data-breadcrumb-kind="current"
            aria-current="page"
          >
            {current.label}
          </button>
        ) : null}
      </div>

      {trailing != null ? (
        <div
          className="pointer-events-auto flex h-full shrink-0 items-stretch py-0 pr-0.5"
          data-station-displays-leaf-trailing=""
          data-testid="station-displays-leaf-trailing"
        >
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
