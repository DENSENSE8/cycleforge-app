'use client';

/** Station chrome — flush identity strip + corner utilities. */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { Panel } from '@/design-system/primitives';
import {
  STATION_WORKBENCH_IDENTITY_COLUMN,
  STATION_WORKBENCH_COLUMN,
} from '@/components/station/workbench/workbench-layout';
import {
  stationIdentityPadClass,
  stationIdentityPanelClass,
  stationContextBarHostClass,
  stationContextBarFlowHostClass,
  stationMoreDetailsHostClass,
} from './station-identity-chrome';

export function StationContextBar({
  identity,
  moreDetails,
  className,
  placement = 'overlay',
}: {
  /** CartonContextCard (or thin station adapter). */
  identity: ReactNode;
  /** {@link StationMoreDetails} cluster — optional for identity-only hosts. */
  moreDetails?: ReactNode;
  className?: string;
  /**
   * `'overlay'` — absolute under GlobalHeader (legacy clearance pad).
   * `'flow'` — in-flow above the workbench (zero gap to PO lines).
   */
  placement?: 'overlay' | 'flow';
}) {
  return (
    <div
      className={cn(
        placement === 'flow'
          ? stationContextBarFlowHostClass
          : stationContextBarHostClass,
        className,
      )}
      data-testid="station-context-bar"
      data-placement={placement}
    >
      <div
        className={cn(
          STATION_WORKBENCH_IDENTITY_COLUMN,
          placement === 'flow'
            ? 'flex items-start'
            : 'pointer-events-auto flex items-start',
        )}
      >
        <Panel
          padding="none"
          radius="lg"
          elevation="none"
          borderless
          className={cn(
            // Panel defaults card fill + soft radius; identity SoT overrides to a
            // coplanar flush white band (rounded-none + card face) via these tokens.
            // White + width share STATION_WORKBENCH_COLUMN (full-bleed middle).
            stationIdentityPanelClass,
            stationIdentityPadClass,
            STATION_WORKBENCH_COLUMN,
            // Height comes from identity rows (`STATION_CHROME_ROW_FACE`) — stretch the measure so cells fill the bar.
            'flex items-stretch overflow-visible',
          )}
          data-testid="station-identity"
        >
          <div className="flex w-full min-w-0 items-stretch" data-testid="station-identity-measure">
            {identity}
          </div>
        </Panel>
      </div>
      {moreDetails != null ? (
        <div
          className={stationMoreDetailsHostClass}
          data-testid="station-more-details-slot"
        >
          {moreDetails}
        </div>
      ) : null}
    </div>
  );
}
