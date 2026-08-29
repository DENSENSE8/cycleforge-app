'use client';

import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';
import { GridStickyXScrollbar } from '@/design-system/components/grid/GridStickyXScrollbar';
import { useSyncedHorizontalScrollbar } from '@/design-system/components/grid/useSyncedHorizontalScrollbar';
import { cn } from '@/utils/_cn';

/**
 * RSC-safe sticky bottom X scrollbar wrapper for non-virtualized tables
 * (dense {@link StationListTable} bodies).
 *
 * The scroll port keeps `no-scrollbar` (trackpad still pans on both axes); the
 * gutter is the always-reachable triage drag affordance — same contract as
 * LedgerGrid.
 */
export function TableStickyXScroll({
  children,
  className,
  bodyClassName,
  bodyStyle,
  bodyRef,
  enabled = true,
}: {
  children: ReactNode;
  className?: string;
  /** Extra classes on the dual-axis scroll port (e.g. `flex-1 overflow-y-auto`). */
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
  /** Optional mirror of the scroll port (keyboard-nav / tests). */
  bodyRef?: RefObject<HTMLDivElement | null>;
  /** When false, renders children only (no h-scroll chrome). */
  enabled?: boolean;
}) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const { gutterRef, spacerWidth, overflowX } = useSyncedHorizontalScrollbar(
    sourceRef,
    enabled,
  );

  useLayoutEffect(() => {
    if (!bodyRef) return;
    const mutable = bodyRef as MutableRefObject<HTMLDivElement | null>;
    mutable.current = sourceRef.current;
    return () => {
      mutable.current = null;
    };
  });

  if (!enabled) {
    return (
      <div ref={sourceRef} className={cn(className, bodyClassName)} style={bodyStyle}>
        {children}
      </div>
    );
  }

  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <div
        ref={sourceRef}
        className={cn(
          'min-w-0 w-full overflow-x-auto overscroll-x-none no-scrollbar',
          bodyClassName,
        )}
        style={bodyStyle}
      >
        {children}
      </div>
      <GridStickyXScrollbar
        gutterRef={gutterRef}
        spacerWidth={spacerWidth}
        className={cn(!overflowX && 'pointer-events-none h-0 opacity-0')}
      />
    </div>
  );
}
