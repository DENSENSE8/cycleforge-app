'use client';

/**
 * Station chrome — floating identity shell + corner utilities.
 *
 * Identity uses {@link STATION_WORKBENCH_IDENTITY_COLUMN} — the same max-width
 * + horizontal pad as StationWorkbench body — so CartonContextCard
 * density=bar matches the line-edit tabs/cards edge-for-edge.
 *
 * Placement: absolute overlay at the panel top
 * ({@link stationContextBarHostClass}) — no in-flow canvas band behind the
 * shell; top inset matches the context-panel card gutter. Hosts must reserve
 * top scroll clearance ({@link STATION_IDENTITY_SCROLL_CLEARANCE} via
 * StationWorkbench `reserveIdentityClearance`).
 *
 *   1. Identity — centered workbench column, full width of that column
 *   2. More details — {@link StationMoreDetails}, absolute at the
 *      work-canvas top + right (out of flow so identity stays centered)
 *
 * Unbox may omit `moreDetails` here and mount it on the pane outer host via
 * {@link stationMoreDetailsPaneHostClass} so Ticket push does not slide the
 * icon cluster left with the squeezed Unbox column.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { Panel } from '@/design-system/primitives';
import { STATION_WORKBENCH_IDENTITY_COLUMN } from '@/components/station/workbench/workbench-layout';
import {
  stationBookmarkPadClass,
  stationBookmarkPanelClass,
  stationContextBarHostClass,
  stationMoreDetailsHostClass,
} from './station-bookmark';

export function StationContextBar({
  identity,
  moreDetails,
  className,
}: {
  /** CartonContextCard density=bar (or pack identity equivalent). */
  identity: ReactNode;
  /** {@link StationMoreDetails} cluster — optional for identity-only hosts. */
  moreDetails?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(stationContextBarHostClass, className)}
      data-testid="station-context-bar"
    >
      <div
        className={cn(
          STATION_WORKBENCH_IDENTITY_COLUMN,
          'pointer-events-auto flex items-start justify-center',
        )}
      >
        <Panel
          padding="none"
          radius="2xl"
          elevation="none"
          borderless
          className={cn(
            stationBookmarkPanelClass,
            stationBookmarkPadClass,
            // Keep overflow visible so IdentityLinkChip hover menus (top-full)
            // are not clipped; horizontal bleed is fixed via bar px + scan rule.
            'flex min-h-10 w-full max-w-full items-center overflow-visible',
          )}
          data-testid="station-identity"
        >
          {identity}
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
