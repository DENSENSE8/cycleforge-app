'use client';

import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';
import { useStationRailDock } from './StationRailDockContext';

/**
 * Dock frame geometry — bottom-anchored at the LEFT edge of the work canvas,
 * growing **upward** to a capped height so the top of the canvas stays clear.
 *
 * `justify-end` is the load-bearing part: content sits flush to the bottom and
 * stacks up, so the scan bar keeps one fixed screen position no matter how many
 * recents are in the rail. A focus-locked scan input that drifts vertically as
 * a live feed grows is the fastest way to make an operator miss the field.
 */
const STATION_RAIL_DOCK_FRAME = cn(
  // `pointer-events-none` on the empty frame so a dock with no registered
  // content never eats clicks meant for the canvas beneath it.
  'pointer-events-none absolute bottom-0 left-3 z-sticky flex flex-col justify-end',
  'w-[320px] max-w-[calc(100%-1.5rem)] max-h-[72%]',
);

/**
 * The rail surface itself — an elevated card rising from the bottom edge.
 * `overlay` elevation because it floats over page content (it is not an in-flow
 * card); no bottom border/radius since it meets the canvas edge.
 */
const STATION_RAIL_DOCK_SURFACE = cn(
  'pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden',
  'rounded-t-2xl border border-b-0 border-border-soft bg-surface-card',
  elevationClass('overlay'),
);

/**
 * Host frame for the floating station rail. Mount ONCE per desktop work column,
 * as a sibling of `<main>` inside the column's `relative` box — that is what
 * anchors the dock to the canvas's bottom-left corner instead of the viewport
 * (viewport-fixed would slide under the docked context sidebar).
 *
 * Renders nothing visible on its own; {@link StationRailPortal} fills it.
 */
export function StationRailDock() {
  const dock = useStationRailDock();
  if (!dock) return null;
  return <div ref={dock.setNode} className={STATION_RAIL_DOCK_FRAME} aria-hidden={false} />;
}

/**
 * Renders `children` into the floating rail dock.
 *
 * **Non-dismissible by contract** — there is no close affordance and no
 * collapsed state. The scan bar and recent rail are how work enters the system;
 * they stay on screen for every station surface, independent of whether the
 * per-route context sidebar is present, empty, or collapsed.
 *
 * Falls back to `fallback` (default: render inline) when no dock is mounted, so
 * the mobile branch and chromeless routes keep working unchanged.
 */
export function StationRailPortal({
  children,
  label = 'Scan and recent activity',
}: {
  children: ReactNode;
  /** Accessible name for the rail region. */
  label?: string;
}) {
  const dock = useStationRailDock();
  if (!dock?.node) return null;
  return createPortal(
    <section aria-label={label} className={STATION_RAIL_DOCK_SURFACE}>
      {children}
    </section>,
    dock.node,
  );
}

/** True when a floating dock is available to portal into. */
export function useHasStationRailDock(): boolean {
  return Boolean(useStationRailDock()?.node);
}
