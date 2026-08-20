'use client';

/**
 * Station chrome — flush identity strip + corner utilities.
 *
 * Host = {@link STATION_WORKBENCH_IDENTITY_COLUMN} full-bleed across the sunken
 * center (layout only — no white). White card face + chip measure =
 * {@link STATION_WORKBENCH_COLUMN} (edge-to-edge of the center column — same
 * wrapper as PO lines + floating notes dock; no `max-w` / `mx-auto` gutters).
 *
 * Placement:
 * - `'overlay'` (default) — absolute float under GlobalHeader
 *   ({@link stationContextBarHostClass}). Hosts must reserve top scroll
 *   clearance (`reserveIdentityClearance`). Never stack ancestor `py-*` under
 *   this float.
 * - `'flow'` — in-flow shrink-0 band ({@link stationContextBarFlowHostClass})
 *   above the workbench. Pair with `reserveIdentityClearance={false}` so the
 *   identity hairline abuts PO lines with zero air.
 *
 *   1. Identity — edge-to-edge white face (floor = `STATION_WORKBENCH_LOCK_PX`)
 *   2. More details — {@link StationMoreDetails}, absolute top-right
 *
 * Unbox may omit `moreDetails` here and mount it on the pane outer host so
 * Ticket push does not slide the icon cluster left with the squeezed column.
 */

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
  /** CartonContextCard (or pack identity equivalent). */
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
            // Height comes from identity rows (`STATION_CHROME_ROW_FACE`) —
            // stretch the measure so cells fill the bar. Never pin h-* here
            // or a two-row stack clips. Bottom seam is the bar's
            // `STATION_CHROME_SEAM_HAIRLINE` — never a Panel `border-b` (that
            // sits 1px below Displays' overlay hairline).
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
