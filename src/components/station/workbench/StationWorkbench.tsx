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

/** Station Workbench — named anatomy for Unbox-family station displays. */
/** Flex-gap per {@link StationWorkbench} `bodyGap`. */
const FLEX_GAP = { none: 'gap-0', default: 'gap-4' } as const;
/** Same steps for the non-flex (content-sized) body. */
const STACK_GAP = { none: 'space-y-0', default: 'space-y-4' } as const;

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
  bodyGap = 'default',
  bodyFill = false,
  className,
  scrollClassName,
  onScroll,
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
   * (above the dock) instead — an absolute dock would cover this slot.
   */
  footer?: ReactNode;
  dock?: ReactNode;
  /** Absolute-float docks need `pb-32`; docked bands use lighter padding. */
  reserveScrollClearance?: boolean | 'pager';
  /** Top clearance for scroll content under identity chrome. */
  reserveIdentityClearance?: boolean | 'stacked';
  /** Where the scroll body rests when it is shorter than the port. */
  bodyAlign?: 'start' | 'end';
  /**
   * Sibling spacing inside the scroll column.
   * `'none'` — flat scan-station floor (Unbox overview): zero vertical gap
   * between centre surfaces. `'default'` keeps `space-y-4` / `gap-4`.
   */
  /** Gap between the body's children. */
  bodyGap?: 'default' | 'none';
  /** Hand the port's height to the centre instead of to the content. */
  bodyFill?: boolean;
  className?: string;
  scrollClassName?: string;
  /** Scrollport `onScroll`. */
  onScroll?: (event: { currentTarget: { scrollTop: number } }) => void;
  /** Soft tonal blobs behind glass cards (Unbox ambient wash). */
  ambientWash?: boolean;
}) {
  // `false` = identity is in-flow (or absent) — no guessed top clearance so
  // the carton context hairline can abut PO lines with zero air.
  const topPad =
    reserveIdentityClearance === 'stacked'
      ? STATION_IDENTITY_STACKED_SCROLL_CLEARANCE
      : reserveIdentityClearance
        ? STATION_IDENTITY_SCROLL_CLEARANCE
        : 'pt-0';
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

      <div
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
        onScroll={onScroll}
      >
        <div
          className={cn(
            STATION_WORKBENCH_COLUMN,
            STATION_WORKBENCH_BODY_PAD_X,
            topPad,
            bottomPad,
            // Bottom-pinned body.
            bodyAlign === 'end'
              ? cn('flex min-h-full flex-col justify-end', FLEX_GAP[bodyGap])
              : bodyFill
                ? cn('flex min-h-full flex-col', FLEX_GAP[bodyGap])
                : STACK_GAP[bodyGap],
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
