import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LocationsWorkspace } from '@/components/warehouse/LocationsWorkspace';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { legacyManageLocationTarget } from '@/lib/inventory/legacy-location-routes';

/** `/inventory/locations` — All · Rooms · Racks · Map · Labels. */
export default async function InventoryLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; code?: string }>;
}) {
  const params = await searchParams;
  // The retired Manage table must not swallow old record links. A deep link
  // carrying its location code now opens that location's record directly.
  if (params.tab === 'manage') redirect(legacyManageLocationTarget(params.code));

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
