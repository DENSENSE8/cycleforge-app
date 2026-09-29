'use client';

import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { ShippingScanBand } from '@/components/sidebar/tech/ShippingScanBand';
import { useShippingPreviewOpen } from '@/components/sidebar/shipping/useShippingPreviewOpen';
import { ShippingStaffScanHistoryRail } from '@/components/sidebar/shipping/ShippingStaffScanHistoryRail';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { useIsMobile } from '@/hooks';

interface Props {
  techId: string;
  techName: string;
  /** Staff id used to theme the scan bar's input border. */
  staffId?: string;
  onComplete?: () => void;
}

/**
 * Picker intake dock: scan band followed by the signed-in staffer's recent
 * station activity in the same contextual sidebar.
 */
export function ShippingSidebarPanel({
  techId,
  techName,
  staffId,
  onComplete,
}: Props) {
  const isMobile = useIsMobile();
  const openShippingPreview = useShippingPreviewOpen();

  const scanBandProps = {
    userId: techId,
    userName: techName,
    staffId: staffId ?? techId,
    onComplete,
    previewLookup: openShippingPreview,
  };

  return (
    <div className={`relative flex h-full w-full flex-col overflow-hidden ${appChromeClass}`}>
      {!isMobile ? <ShippingScanBand {...scanBandProps} /> : null}

      {!isMobile ? (
        <SidebarRailScrollport>
          <ShippingStaffScanHistoryRail techId={techId} />
        </SidebarRailScrollport>
      ) : null}

      {isMobile ? (
        <div className={`flex-shrink-0 border-t border-border-hairline bg-surface-card ${SIDEBAR_GUTTER} pb-[max(1.125rem,env(safe-area-inset-bottom))] pt-3`}>
          <ShippingScanBand {...scanBandProps} scanOnly />
        </div>
      ) : null}
    </div>
  );
}
