'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { STATION_TERMINAL_SCROLL_CLEARANCE } from '@/components/station/terminal/StationTerminalDock';
import { STATION_IDENTITY_SCROLL_CLEARANCE } from '@/components/station/entity-context/station-bookmark';
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
 *                      Unbox-family embeds density=bar identity in StationContextBar)
 *   3. tabs          — SectionTabsSlider (bar + mounted panels) OR plain body
 *   4. children      — extra scroll-body content (triage card stack, siblings)
 *   5. feedback      — inline action / receive feedback bands
 *   6. dock          — StationComposerDock (optional) + StationTerminalDock
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
   * Sticky band between scroll body and dock (e.g. ReceiveFeedbackRegion).
   * Not scrolled away with the body.
   */
  footer?: ReactNode;
  dock?: ReactNode;
  /** Absolute-float docks need `pb-32`; docked bands (unbox) use lighter padding. */
  reserveScrollClearance?: boolean;
  /**
   * Absolute-float {@link StationContextBar} needs top clearance so scroll
   * content is not hidden under the identity shell. Default true — Unbox-family
   * hosts mount the floating context bar. Pass false when this workbench has
   * no floating identity overlay.
   */
  reserveIdentityClearance?: boolean;
  className?: string;
  scrollClassName?: string;
  /** Soft tonal blobs behind glass cards (Unbox ambient wash). */
  ambientWash?: boolean;
}) {
  const topPad = reserveIdentityClearance ? STATION_IDENTITY_SCROLL_CLEARANCE : 'pt-5';
  const bottomPad = reserveScrollClearance ? STATION_TERMINAL_SCROLL_CLEARANCE : 'pb-6';

  return (
    <div
      className={cn(
        'relative isolate flex h-full min-h-0 flex-col bg-surface-canvas',
        className,
      )}
    >
      {ambientWash ? <StationAmbientWash /> : null}

      {toolbar}

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div
          className={cn(
            STATION_WORKBENCH_COLUMN,
            'space-y-4',
            STATION_WORKBENCH_BODY_PAD_X,
            topPad,
            bottomPad,
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
