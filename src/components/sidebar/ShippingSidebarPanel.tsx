'use client';

import { useState } from 'react';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { ShippingScanBand } from '@/components/sidebar/tech/ShippingScanBand';
import { ShippingStaffScanHistoryRail } from '@/components/sidebar/shipping/ShippingStaffScanHistoryRail';
import { SearchField } from '@/design-system/primitives/SearchField';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import {
  EMPTY_STATION_HISTORY_RAIL_FACETS,
  StationHistoryRailFilters,
  type StationHistoryRailFacets,
} from '@/components/sidebar/rail-shell/StationHistoryRailFilters';
import { useIsMobile } from '@/hooks';

interface Props {
  techId: string;
  techName: string;
  /** Staff id used to theme the scan bar's input border. */
  staffId?: string;
  onComplete?: () => void;
}

/**
 * Tech sidebar for Shipping mode — order / FNSKU scan band plus the History
 * feed rail (the signed-in staffer's latest 25 TECH station scans). Pick one
 * to reopen Shipping preview. Shares the shell anatomy of
 * {@link TestingSidebarPanel} (scan band, scrollable rail, bottom filter).
 */
export function ShippingSidebarPanel({
  techId,
  techName,
  staffId,
  onComplete,
}: Props) {
  const isMobile = useIsMobile();
  const [railFilter, setRailFilter] = useState('');
  const [railFacets, setRailFacets] = useState<StationHistoryRailFacets>(
    EMPTY_STATION_HISTORY_RAIL_FACETS,
  );

  const scanBandProps = {
    userId: techId,
    userName: techName,
    staffId: staffId ?? techId,
    onComplete,
  };

  return (
    <div className={`relative flex h-full w-full flex-col overflow-hidden ${appChromeClass}`}>
      {!isMobile ? <ShippingScanBand {...scanBandProps} /> : null}

      <SidebarRailScrollport>
        <ShippingStaffScanHistoryRail
          techId={techId}
          filterText={railFilter}
          facets={railFacets}
        />
      </SidebarRailScrollport>

      <SearchField
        value={railFilter}
        onChange={setRailFilter}
        placeholder="Filter history…"
        rightElement={
          <StationHistoryRailFilters facets={railFacets} onChange={setRailFacets} />
        }
        />

      {isMobile ? (
        <div className={`flex-shrink-0 border-t border-border-hairline bg-surface-card ${SIDEBAR_GUTTER} pb-[max(1.125rem,env(safe-area-inset-bottom))] pt-3`}>
          <ShippingScanBand {...scanBandProps} scanOnly />
        </div>
      ) : null}
    </div>
  );
}
