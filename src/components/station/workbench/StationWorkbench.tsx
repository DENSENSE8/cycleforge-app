'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import {
  STATION_TERMINAL_PAGER_SCROLL_CLEARANCE,
  STATION_TERMINAL_SCROLL_CLEARANCE,
} from '@/components/station/terminal/StationTerminalDock';
import {
  STATION_IDENTITY_SCROLL_CLEARANCE,
  STATION_IDENTITY_STACKED_SCROLL_CLEARANCE,
} from '@/components/station/entity-context/station-identity-chrome';
import { StationAmbientWash } from './StationAmbientWash';
import {
  STATION_WORKBENCH_COLUMN,
  STATION_WORKBENCH_BODY_PAD_X,
} from './workbench-layout';

/**
 * Station Workbench — named anatomy for Unbox-family station displays.
 *
 * Vertical slots (top → bottom):
 *   1. toolbar       — frozen utility icon bar (optional; Unbox-family embeds
 *                      utilities in StationContextBar / StationMoreDetails)
 *   2. entityContext — CartonContextCard (or adapter) identity row (optional;
 *                      Unbox-family embeds two-row identity in StationContextBar)
 *   3. tabs          — SectionTabsSlider (bar + mounted panels) OR plain body
 *   4. children      — extra scroll-body content (triage card stack, siblings)
 *   5. feedback      — inline action / receive feedback bands
 *   6. dock          — OmnichannelComposerDock (optional) + StationTerminalDock
 *
 * Station chrome (corner utilities · identity column synced to workbench
 * body via {@link STATION_WORKBENCH_IDENTITY_COLUMN}) lives in
 * StationContextBar as an absolute float above this workbench. Carton
 * pipeline stepper lives only in ReceivingDetailsStack.
 *
 * Overlays (photo peek, modals) compose around StationWorkbench, not inside it.
 */
export function StationWorkbench({
  toolbar,
  entityContext,
  tabs,
  children,
  feedback,
  footer,
  dock,
  reserveScrollClearance = false,
  reserveIdentityClearance = true,
  bodyAlign = 'start',
  className,
  scrollClassName,
  ambientWash = false,
}: {
  toolbar?: ReactNode;
  entityContext?: ReactNode;
  tabs?: ReactNode;
  children?: ReactNode;
  /** Inline feedback inside the scroll column (e.g. WorkspaceActionFeedbackSlot). */
  feedback?: ReactNode;
  /**
   * Sticky band between scroll body and dock.
   * Unbox mounts `ReceiveFeedbackRegion` in the absolute dock float stack
   * (above `UnboxDockHost`) instead — an absolute dock would cover this slot.
   */
  footer?: ReactNode;
  dock?: ReactNode;
  /**
   * Absolute-float docks need `pb-32`; docked bands use lighter padding.
   *
 * Pass `'pager'` when the dock carries a step-pager row inside its shell
 * (Unbox) — that row makes the dock ~28px taller, and the clearance is the
 * only thing keeping the scroll body out from under it.
 *
 * There is deliberately no variant per dock ROW. Two were added on 2026-08-02
 * (a step-action row, a cue line) and both were deleted the same day with the
 * rows they measured — a constant that outlives its row is one someone else
 * reaches for by name. Add one only when a composition is genuinely TALLER
 * than `pager`, and delete it with its row. Collapsed vs expanded notes share
 * this same clearance: over-reserve when collapsed is safe.
   */
  reserveScrollClearance?: boolean | 'pager';
  /**
   * Absolute-float {@link StationContextBar} needs top clearance so scroll
   * content is not hidden under the identity shell. Default true — Unbox-family
   * hosts mount the floating context bar. Pass false when this workbench has
   * no floating identity overlay. Pass `'stacked'` when the identity is
   * Two-row `CartonContextCard` (32px taller shell) — use `"stacked"`.
   */
  reserveIdentityClearance?: boolean | 'stacked';
  /**
   * Where the scroll body rests when it is shorter than the port.
   *
   * `'end'` bottom-pins it against the dock and lets it grow UPWARD — the
   * geometry a station WORK surface wants, because the operator's eye path is
   * product → down → the live step → the composer that commits it. A work
   * surface floating at the top of an empty canvas has put their eye in the
   * wrong place.
   *
   * It lives here rather than on the child because `min-height: 100%` only
   * resolves against an ancestor with a DEFINITE height, and the scroll port is
   * the nearest one. A `min-h-full` written inside a non-flex wrapper further
   * down resolves to zero and does nothing — silently.
   *
   * When `'end'`, sibling spacing is flex `gap-4` (not `space-y-*`): an Items
   * pin with `mb-auto` would override `space-y`'s margin and erase the gap.
   *
   * Opt-in: `'start'` (the default) keeps every existing station's top-anchored
   * body exactly as it was.
   */
  bodyAlign?: 'start' | 'end';
  className?: string;
  scrollClassName?: string;
  /** Soft tonal blobs behind glass cards (Unbox ambient wash). */
  ambientWash?: boolean;
}) {
  const topPad =
    reserveIdentityClearance === 'stacked'
      ? STATION_IDENTITY_STACKED_SCROLL_CLEARANCE
      : reserveIdentityClearance
        ? STATION_IDENTITY_SCROLL_CLEARANCE
        : 'pt-5';
  const bottomPad =
    reserveScrollClearance === 'pager'
      ? STATION_TERMINAL_PAGER_SCROLL_CLEARANCE
      : reserveScrollClearance
        ? STATION_TERMINAL_SCROLL_CLEARANCE
        : 'pb-6';

  return (
    <div
      className={cn(
        'relative isolate flex h-full min-h-0 flex-col',
        // Own the sunken plane when this root also paints the wash; stay
        // transparent under StationPanelRoot (ambientWash={false}).
        ambientWash ? 'bg-surface-sunken' : 'bg-transparent',
        className,
      )}
    >
      {ambientWash ? <StationAmbientWash /> : null}

      {toolbar}

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div
          className={cn(
            STATION_WORKBENCH_COLUMN,
            STATION_WORKBENCH_BODY_PAD_X,
            topPad,
            bottomPad,
            // Bottom-pinned body. `min-h-full` (never `h-full`) is the
            // load-bearing half: it makes the content at least a port tall so
            // `justify-end` has something to push against, while still letting
            // the stack grow past the fold and scroll. Flex items keep
            // `min-height: auto`, so a tall body overflows into the port rather
            // than squashing.
            //
            // Spacing MUST be flex `gap`, not `space-y-*`, when bottom-pinned:
            // Unbox pins Items with `mb-auto`, which overrides `space-y`'s
            // margin-bottom and collapses the Items↔procedure gap to zero
            // whenever free space runs out. `gap-4` survives `mb-auto`.
            bodyAlign === 'end'
              ? 'flex min-h-full flex-col justify-end gap-4'
              : 'space-y-4',
            scrollClassName,
          )}
        >
          {entityContext}
          {tabs}
          {children}
          {feedback}
        </div>
      </div>

      {footer}
      {dock}
    </div>
  );
}
