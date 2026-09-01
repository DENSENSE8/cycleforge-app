'use client';

import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { ShippingScanBand } from '@/components/sidebar/tech/ShippingScanBand';
import { ShippingStaffScanHistoryRail } from '@/components/sidebar/shipping/ShippingStaffScanHistoryRail';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import {
  EMPTY_STATION_HISTORY_RAIL_FACETS,
  StationHistoryRailFilters,
  type StationHistoryRailFacets,
} from '@/components/sidebar/rail-shell/StationHistoryRailFilters';
import { useScanPreviewRailFilter } from '@/components/station/scan-bar/station-scan-preview-rail';
import { useShippingPreviewOpen } from '@/components/sidebar/shipping/useShippingPreviewOpen';
import { useIsMobile } from '@/hooks';
import { useState } from 'react';

interface Props {
  techId: string;
  techName: string;
  /** Staff id used to theme the scan bar's input border. */
  staffId?: string;
  onComplete?: () => void;
}

/**
 * Ready to Pack / Shipping left dock — Unbox recent-rail SoT.
 *
 * Scan band on top, recents beneath. Preview (leading icon) turns the bar
 * into the rail's find field; facets ride the bar. No footer SearchField.
 */
export function ShippingSidebarPanel({
  techId,
  techName,
  staffId,
  onComplete,
}: Props) {
  const isMobile = useIsMobile();
  const { previewFiltering, railFilter, setRailFilter } = useScanPreviewRailFilter();
  const [railFacets, setRailFacets] = useState<StationHistoryRailFacets>(
    EMPTY_STATION_HISTORY_RAIL_FACETS,
  );
  const openShippingPreview = useShippingPreviewOpen();

  const scanBandProps = {
    userId: techId,
    userName: techName,
    staffId: staffId ?? techId,
    onComplete,
    previewLookup: openShippingPreview,
    filterSlot: previewFiltering ? (
      <StationHistoryRailFilters facets={railFacets} onChange={setRailFacets} />
    ) : null,
    onPreviewFilterText: (next: string) => {
      if (previewFiltering) setRailFilter(next);
    },
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

      {isMobile ? (
        <div className={`flex-shrink-0 border-t border-border-hairline bg-surface-card ${SIDEBAR_GUTTER} pb-[max(1.125rem,env(safe-area-inset-bottom))] pt-3`}>
          <ShippingScanBand {...scanBandProps} scanOnly />
        </div>
      ) : null}
    </div>
  );
}
