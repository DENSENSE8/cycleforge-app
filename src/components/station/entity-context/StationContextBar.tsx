'use client';

/** Station chrome — flush identity strip + corner utilities + the three-bubble row under it. */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { Panel } from '@/design-system/primitives';
import { WorkspaceCard } from '@/design-system/components';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { stationBubbleMaterialStyle, type StationBubbleMaterial } from '@/design-system/tokens/grain';
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

/** Left → right; each bubble's material follows what the operator does with it (see `StationBubbleMaterial`). */
const BUBBLE_SLOTS: ReadonlyArray<{ slot: 'nextStep' | 'summary' | 'label'; material: StationBubbleMaterial }> = [
  { slot: 'nextStep', material: 'action' },
  { slot: 'summary', material: 'record' },
  { slot: 'label', material: 'paper' },
];

export function StationContextBar({
  identity,
  moreDetails,
  bubbles,
  className,
  placement = 'overlay',
}: {
  /** CartonContextCard (or thin station adapter). */
  identity: ReactNode;
  /** {@link StationMoreDetails} cluster — optional for identity-only hosts. */
  moreDetails?: ReactNode;
  /**
   * The row between the identity row and the work below (operator 2026-10-07):
   * three equal bubbles — next step top-left ({@link StationNextActionHeadline}),
   * a brief summary in the middle, the printed label on the right. Same
   * surface, radius and shadow for all three; an empty slot keeps its column.
   */
  bubbles?: { nextStep?: ReactNode; summary?: ReactNode; label?: ReactNode };
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
            ? 'flex flex-col'
            : 'pointer-events-auto flex flex-col',
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
        {bubbles ? (
          <div
            className={cn(
              STATION_WORKBENCH_COLUMN,
              'grid grid-cols-1 items-stretch gap-5 px-5 py-4 md:grid-cols-3',
            )}
            data-testid="station-bubble-row"
          >
            {BUBBLE_SLOTS.map(({ slot, material }) =>
              bubbles[slot] != null ? (
                <WorkspaceCard
                  key={slot}
                  overflow="visible"
                  className={cn('group/bubble min-w-0', cornerClass('canvas'), elevationClass('raised', 'default'))}
                  surfaceStyle={stationBubbleMaterialStyle(material)}
                  bodyClassName="h-full px-4 py-3"
                >
                  <div className="h-full min-w-0" data-testid={`station-bubble-${slot}`} data-material={material}>
                    {bubbles[slot]}
                  </div>
                </WorkspaceCard>
              ) : (
                <div key={slot} aria-hidden />
              ),
            )}
          </div>
        ) : null}
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
