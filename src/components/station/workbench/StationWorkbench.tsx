'use client';

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { STATION_TERMINAL_SCROLL_CLEARANCE } from '@/components/station/terminal/StationTerminalDock';
import { StationAmbientWash } from './StationAmbientWash';
import {
  STATION_WORKBENCH_COLUMN,
  STATION_WORKBENCH_BODY_DOCKED,
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
 * StationContextBar above this workbench. Carton pipeline stepper
 * lives only in ReceivingDetailsStack.
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
  className?: string;
  scrollClassName?: string;
  /** Soft tonal blobs behind glass cards (Unbox ambient wash). */
  ambientWash?: boolean;
}) {
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
            reserveScrollClearance
              ? `${STATION_WORKBENCH_COLUMN} space-y-4 ${STATION_WORKBENCH_BODY_PAD_X} py-5 ${STATION_TERMINAL_SCROLL_CLEARANCE}`
              : STATION_WORKBENCH_BODY_DOCKED,
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
