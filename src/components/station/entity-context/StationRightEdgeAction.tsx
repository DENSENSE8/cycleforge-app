'use client';

/**
 * Mid-canvas right-edge sliced action tab — flush to the work-canvas right edge.
 *
 * Same bookmark family as {@link StationMoreDetails}: left corners rounded,
 * right edge sliced (no radius / border). Secondary surface jumps only
 * (e.g. Triage → Open in Unbox) — never the primary terminal CTA
 * (`SlicedActionDock` / `StationTerminalDock`).
 *
 * Mount on the panel’s `relative` full-height canvas root with
 * {@link stationRightEdgeActionHostClass}. Do **not** nest under
 * `StationContextBar` `moreDetails` (top-right utilities only).
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { Panel } from '@/design-system/primitives';
import {
  stationBookmarkPadClass,
  stationRightEdgeActionClass,
} from './station-bookmark';

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
        stationBookmarkPadClass,
        'flex shrink-0 items-center overflow-visible',
        className,
      )}
      data-testid={testId}
    >
      {children}
    </Panel>
  );
}
