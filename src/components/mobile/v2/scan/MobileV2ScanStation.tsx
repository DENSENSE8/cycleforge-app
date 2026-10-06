'use client';

import type { StationItemAction, StationTapeEntry } from '@/lib/mobile/station-tape';
import { MobileV2ScanRecentList } from './MobileV2ScanRecentList';

/** V2 scan composition: newest-first recents above the bottom-mounted capture window. */
export function MobileV2ScanStation({
  entries,
  itemActions,
  itemOpen,
  untitledLabel,
  empty,
  more,
  captureWindow,
}: {
  entries: readonly StationTapeEntry[];
  itemActions?: (entry: StationTapeEntry) => readonly StationItemAction[] | null;
  itemOpen?: (entry: StationTapeEntry) => (() => void) | null;
  untitledLabel: string;
  empty?: React.ReactNode;
  /** Under the rows, when there are rows: how to reach more of them. */
  more?: React.ReactNode;
  captureWindow: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-canvas" data-mobile-scan-architecture="v2">
      <MobileV2ScanRecentList
        entries={entries}
        untitledLabel={untitledLabel}
        itemActions={itemActions}
        itemOpen={itemOpen}
        empty={empty}
        more={more}
      />
      {captureWindow}
    </div>
  );
}
