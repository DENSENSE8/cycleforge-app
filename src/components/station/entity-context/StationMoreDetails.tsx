'use client';

/**
 * Station utilities — top-right flush shell.
 *
 * Unbox + Arrival no longer mount Refresh here (PO link is the carton `#`
 * chip → Package Pairing). Testing still hosts Refresh + Pair via
 * {@link StationHeaderToolbar}. Share / Audit / Copy / Info live on
 * `/carton/[id]`; Move photos on the photo gallery. Rendered at the
 * work-canvas top + right edges in {@link StationContextBar} so the centered
 * identity strip stays true-center. Flush-top recipe
 * ({@link stationUtilityPanelClass}). Pad + gap match GlobalHeader icon rail.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { Panel } from '@/design-system/primitives';
import {
  stationIdentityGapClass,
  stationIdentityPadClass,
  stationUtilityPanelClass,
} from './station-identity-chrome';

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
        stationUtilityPanelClass,
        stationIdentityPadClass,
        stationIdentityGapClass,
        'flex min-h-10 shrink-0 items-center overflow-visible',
        className,
      )}
      data-testid="station-more-details"
    >
      {children}
    </Panel>
  );
}
