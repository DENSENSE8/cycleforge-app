'use client';

import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { ShippingScanBand } from '@/components/sidebar/tech/ShippingScanBand';
import { useShippingPreviewOpen } from '@/components/sidebar/shipping/useShippingPreviewOpen';
import { useIsMobile } from '@/hooks';

interface Props {
  techId: string;
  techName: string;
  /** Staff id used to theme the scan bar's input border. */
  staffId?: string;
  onComplete?: () => void;
}

/**
 * Ready to Pack / Shipping intake dock. Persisted shipment rows and history
 * belong in the central workspace; this column owns scan intake only.
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

      {isMobile ? (
        <div className={`flex-shrink-0 border-t border-border-hairline bg-surface-card ${SIDEBAR_GUTTER} pb-[max(1.125rem,env(safe-area-inset-bottom))] pt-3`}>
          <ShippingScanBand {...scanBandProps} scanOnly />
        </div>
      ) : null}
    </div>
  );
}
