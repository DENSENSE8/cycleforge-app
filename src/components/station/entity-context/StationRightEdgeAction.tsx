'use client';

/**
 * Mid-canvas right-edge sliced action tab — flush to the work-canvas right edge.
 *
 * Left corners rounded, right edge sliced (no radius / border). Secondary
 * surface jumps only (e.g. Triage → Open in Unbox) — never the primary
 * terminal CTA (`SlicedActionDock` / `StationTerminalDock`).
 *
 * Mount on the panel’s `relative` full-height canvas root with
 * {@link stationRightEdgeActionHostClass}. Do **not** nest under
 * `StationContextBar` `moreDetails` (top-right utilities only).
 *
 * Parked SoT (knip-ignored until Triage remounts). Chrome tokens live here —
 * not on `station-identity-chrome` — so the identity strip module stays live.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { Panel } from '@/design-system/primitives';
import { elevationClass } from '@/design-system/tokens/shadows';
import { stationIdentityPadClass } from './station-identity-chrome';

const STATION_IDENTITY_ELEVATION = elevationClass('raised', 'soft');

/**
 * Face: flush right; hairline on left · top · bottom; left corners rounded;
 * right edge sliced.
 */
const stationRightEdgeActionClass =
  `rounded-l-2xl rounded-r-none border border-r-0 border-border-soft ${STATION_IDENTITY_ELEVATION}`;

/** Host class for the panel’s `relative` canvas root. */
export const stationRightEdgeActionHostClass =
  'absolute right-0 top-1/4 z-raised';

export function StationRightEdgeAction({
  children,
  className,
  'data-testid': testId = 'station-right-edge-action',
}: {
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <Panel
      padding="none"
      radius="2xl"
      elevation="none"
      borderless
      className={cn(
        stationRightEdgeActionClass,
        stationIdentityPadClass,
        'flex shrink-0 items-center overflow-visible',
        className,
      )}
      data-testid={testId}
    >
      {children}
    </Panel>
  );
}
