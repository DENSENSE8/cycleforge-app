'use client';

/** Station utilities — top-right flush shell. */

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
      radius="lg"
      elevation="none"
      borderless
      className={cn(
        // Same coplanar flush override as StationContextBar identity.
        stationUtilityPanelClass,
        stationIdentityPadClass,
        stationIdentityGapClass,
        'flex h-full shrink-0 items-center overflow-visible',
        className,
      )}
      data-testid="station-more-details"
    >
      {children}
    </Panel>
  );
}
