'use client';

/**
 * Station utilities — top-right corner bookmark tab.
 *
 * Hosts refresh · more · info via {@link StationHeaderToolbar} (Unbox + Arrival).
 * Rendered flush to the work-canvas top + right edges in {@link StationContextBar}
 * so the centered identity bookmark stays true-center. No top/right hairline —
 * left + bottom stroke only ({@link stationMoreDetailsPanelClass}).
 * Pad + gap match GlobalHeader icon rail.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { Panel } from '@/design-system/primitives';
import {
  stationBookmarkGapClass,
  stationBookmarkPadClass,
  stationMoreDetailsPanelClass,
} from './station-bookmark';

export function StationMoreDetails({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel
      padding="none"
      radius="2xl"
      elevation="none"
      borderless
      className={cn(
        stationMoreDetailsPanelClass,
        stationBookmarkPadClass,
        stationBookmarkGapClass,
        'flex min-h-10 shrink-0 items-center overflow-visible',
        className,
      )}
      data-testid="station-more-details"
    >
      {children}
    </Panel>
  );
}
