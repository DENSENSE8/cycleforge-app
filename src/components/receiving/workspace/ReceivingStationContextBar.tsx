'use client';

/**
 * Unbox-family station chrome — bookmark tabs flush under GlobalHeader.
 *
 * Identity bookmark uses {@link STATION_WORKBENCH_IDENTITY_COLUMN} — the same
 * max-width + horizontal pad as StationWorkbench body — so CartonContextCard
 * density=bar matches the line-edit tabs/cards edge-for-edge.
 *
 *   1. Identity — centered workbench column, full width of that column
 *   2. More details — {@link ReceivingStationMoreDetails}, absolute top-right
 *      corner (minimal right inset; out of flow so identity stays centered)
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { Panel } from '@/design-system/primitives';
import { STATION_WORKBENCH_IDENTITY_COLUMN } from '@/components/station/workbench/workbench-layout';
import {
  receivingStationBookmarkPadClass,
  receivingStationBookmarkPanelClass,
} from './receiving-station-bookmark';

/** Far-right inset for the more-details corner bookmark — keep flush. */
const MORE_DETAILS_CORNER_CLASS = 'absolute top-0 right-1 flex items-start';

export function ReceivingStationContextBar({
  identity,
  moreDetails,
  className,
}: {
  /** CartonContextCard density=bar (or pack identity equivalent). */
  identity: ReactNode;
  /** {@link ReceivingStationMoreDetails} cluster — optional for identity-only hosts. */
  moreDetails?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('relative z-10 w-full shrink-0', className)}
      data-testid="receiving-station-context-bar"
    >
      <div
        className={cn(
          STATION_WORKBENCH_IDENTITY_COLUMN,
          'flex items-center justify-center',
        )}
      >
        <Panel
          padding="none"
          radius="xl"
          elevation="none"
          borderless
          className={cn(
            receivingStationBookmarkPanelClass,
            receivingStationBookmarkPadClass,
            // Keep overflow visible so IdentityLinkChip hover menus (top-full)
            // are not clipped; horizontal bleed is fixed via bar px + scan rule.
            'flex min-h-10 w-full max-w-full items-center overflow-visible',
          )}
          data-testid="receiving-station-identity"
        >
          {identity}
        </Panel>
      </div>
      {moreDetails != null ? (
        <div
          className={MORE_DETAILS_CORNER_CLASS}
          data-testid="receiving-station-more-details-slot"
        >
          {moreDetails}
        </div>
      ) : null}
    </div>
  );
}
