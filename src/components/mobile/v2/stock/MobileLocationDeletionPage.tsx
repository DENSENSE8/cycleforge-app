'use client';

import { MapPin } from '@/components/Icons';
import { LocationDeletionManager } from '@/features/locations/LocationDeletionManager';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { WAREHOUSE_PATHS } from '@/lib/nav/route-tree';

export function MobileLocationDeletionPage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-mode-panel" data-testid="mobile-location-deletion">
      <MobileV2DetailTopBar
        title="Manage locations"
        subtitle="Names · empty positions"
        backHref={WAREHOUSE_PATHS.stock}
        close
        lead={<MapPin className="h-5 w-5 text-emerald-600" />}
      />
      <LocationDeletionManager variant="page" />
    </div>
  );
}
