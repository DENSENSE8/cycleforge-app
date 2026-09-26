'use client';

/** Shared index → leaf **stage body** — the Unbox SoT waist for right-edge topic navigation. */

import type { ComponentPropsWithRef, ReactNode } from 'react';
import type { SectionTab } from '@/design-system/components';
import { DISPLAYS_FLUSH_HOST } from '@/design-system/shells/detail-stack/layout';
import { cn } from '@/utils/_cn';
import type { DisplayIndexRow } from './display-index';
import {
  StationDisplayIndexList,
  type StationDisplayIndexFilterKeys,
} from './StationDisplayIndexList';

export type { StationDisplayIndexFilterKeys };

type IndexListRef = ComponentPropsWithRef<typeof StationDisplayIndexList>['ref'];

export function DisplaysIndexLeafStage({
  onIndex,
  /**
   * Sticky top band for **both** stages (station: history ←→ chrome on index
   * and leaf; desk: ⋮ on index / {@link StationDisplayLeafHeader} on leaf).
   */
  stickyHeader = null,
  rows,
  tabs,
  onSelectLeaf,
  lastLeafId = null,
  filterQuery,
  onClearFilter,
  indexFilterKeysRef,
  leafId,
  leafBody,
  className,
  leafTestId = 'displays-index-leaf',
}: {
  onIndex: boolean;
  stickyHeader?: ReactNode;
  rows: DisplayIndexRow[];
  tabs: readonly SectionTab[];
  onSelectLeaf: (id: string) => void;
  lastLeafId?: string | null;
  filterQuery?: string;
  onClearFilter?: () => void;
  indexFilterKeysRef?: IndexListRef;
  leafId?: string;
  leafBody: ReactNode;
  className?: string;
  leafTestId?: string;
}) {
  return (
    <div
      className={cn(DISPLAYS_FLUSH_HOST, 'flex min-h-0 flex-1 flex-col', className)}
      data-displays-index-leaf-stage=""
      data-displays-stage={onIndex ? 'index' : 'leaf'}
    >
      {onIndex ? (
        <div className="flex h-full min-h-0 flex-col">
          {stickyHeader}
          <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
            <StationDisplayIndexList
              ref={indexFilterKeysRef}
              rows={rows}
              tabs={tabs}
              onSelect={onSelectLeaf}
              activeId={lastLeafId}
              filterQuery={filterQuery}
              onClearFilter={onClearFilter}
            />
          </div>
        </div>
      ) : (
        <div
          className="flex h-full min-h-0 flex-col"
          data-testid={leafTestId}
          data-station-displays-leaf={leafId}
        >
          {stickyHeader}
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            data-station-displays-leaf-body=""
          >
            {leafBody}
          </div>
        </div>
      )}
    </div>
  );
}
