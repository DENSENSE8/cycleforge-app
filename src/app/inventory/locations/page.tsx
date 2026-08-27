import { Suspense } from 'react';
import { LocationsWorkspace } from '@/components/warehouse/LocationsWorkspace';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/** `/inventory/locations` — Bin Tags · Racks · Rooms · Bins · Map (former `/warehouse`). */
export default function InventoryLocationsPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
            <LoadingSpinner size="lg" className="text-blue-600" />
          </div>
        }
      >
        <LocationsWorkspace />
      </Suspense>
    </div>
  );
}
