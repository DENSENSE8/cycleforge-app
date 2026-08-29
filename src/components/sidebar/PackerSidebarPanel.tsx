'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PackScanColumn from '@/components/station/PackScanColumn';
import { PackRecentPacksRail } from '@/components/sidebar/packer/PackRecentPacksRail';
import { SearchField } from '@/design-system/primitives/SearchField';
import {
  EMPTY_STATION_HISTORY_RAIL_FACETS,
  StationHistoryRailFilters,
  type StationHistoryRailFacets,
} from '@/components/sidebar/rail-shell/StationHistoryRailFilters';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveStaffDirectory } from './hooks';

import { parsePackScanMode } from '@/utils/pack-workspace-state';

export function PackerSidebarPanel() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const staffIdNum = user?.staffId ?? 0;
  const packerId = String(staffIdNum);
  const staffDirectory = useActiveStaffDirectory();
  const [railFilter, setRailFilter] = useState('');
  const [railFacets, setRailFacets] = useState<StationHistoryRailFacets>(
    EMPTY_STATION_HISTORY_RAIL_FACETS,
  );

  // Pack mode — persisted via ?packMode= URL param so refresh/sharing preserves it.
  const packMode = parsePackScanMode(searchParams.get('packMode'));

  const packerMember = staffDirectory.find((m) => String(m.id) === packerId);
  const packerName = packerMember?.name || 'Packer';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <PackScanColumn
          userId={packerId}
          userName={packerName}
          staffId={packerId}
          packMode={packMode}
          railSlot={
            <PackRecentPacksRail
              packerId={staffIdNum}
              filterText={railFilter}
              facets={railFacets}
            />
          }
          railFooter={
            <SearchField
              value={railFilter}
              onChange={setRailFilter}
              placeholder="Filter recent packs…"
              rightElement={
                <StationHistoryRailFilters facets={railFacets} onChange={setRailFacets} />
              }
        />
          }
        />
      </div>
    </div>
  );
}
