import { Suspense } from 'react';
import { FavoritesManagementTab } from '@/components/admin/FavoritesManagementTab';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/** `/inventory/favorites` — quick-pick SKU shortcuts per workspace (ex-Admin ›
 * Favorites; admin dissolution). Sibling of Locations: its own body under the
 * Inventory desk frame. */
export default function InventoryFavoritesPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
            <LoadingSpinner size="lg" className="text-text-muted" />
          </div>
        }
      >
        <FavoritesManagementTab />
      </Suspense>
    </div>
  );
}
