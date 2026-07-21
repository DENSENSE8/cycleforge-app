'use client';

/**
 * Search order-detail identity bookmark — the station entity-context bookmark
 * chrome (`stationBookmarkPanelClass`: flush top, rounded bottom, soft raised),
 * as a variant sized to the Search detail lane rather than the station identity
 * column. Composes the same `Panel` + bookmark tokens as {@link StationContextBar}
 * so the order identity hangs like a header bookmark under the detail chrome.
 */

import type { ReactNode } from 'react';
import { Panel } from '@/design-system/primitives';
import {
  stationBookmarkPadClass,
  stationBookmarkPanelClass,
} from '@/components/station/entity-context/station-bookmark';
import { cn } from '@/utils/_cn';

export function SearchOrderContextBar({
  identity,
  className,
}: {
  identity: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('w-full shrink-0', className)} data-testid="search-order-context-bar">
      <Panel
        padding="none"
        radius="xl"
        elevation="none"
        borderless
        className={cn(
          stationBookmarkPanelClass,
          stationBookmarkPadClass,
          // Overflow visible so identity hover menus (tooltips) aren't clipped.
          'flex min-h-11 w-full max-w-full items-center overflow-visible',
        )}
      >
        {identity}
      </Panel>
    </div>
  );
}
