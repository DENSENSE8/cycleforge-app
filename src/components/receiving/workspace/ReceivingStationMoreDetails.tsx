'use client';

/**
 * Unbox-family station utilities — corner bookmark tab.
 *
 * Hosts refresh · more · info via {@link LineEditToolbar}. Rendered in the
 * absolute corner slot of {@link ReceivingStationContextBar} so the centered
 * identity bookmark stays true-center. Pad + gap match GlobalHeader icon rail
 * ({@link receivingStationBookmarkPadClass} /
 * {@link receivingStationBookmarkGapClass}).
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { Panel } from '@/design-system/primitives';
import {
  receivingStationBookmarkGapClass,
  receivingStationBookmarkPadClass,
  receivingStationBookmarkPanelClass,
} from './receiving-station-bookmark';

export function ReceivingStationMoreDetails({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel
      padding="none"
      radius="xl"
      elevation="none"
      borderless
      className={cn(
        receivingStationBookmarkPanelClass,
        receivingStationBookmarkPadClass,
        receivingStationBookmarkGapClass,
        'flex min-h-10 shrink-0 items-center overflow-visible',
        className,
      )}
      data-testid="receiving-station-more-details"
    >
      {children}
    </Panel>
  );
}
