import { Suspense } from 'react';
import { ReasonCodesManagementTab } from '@/components/admin/ReasonCodesManagementTab';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/** `/inventory/reason-codes` — movement / adjustment / shrinkage catalog
 * (ex-Admin › Reason Codes; admin dissolution). Sibling of Locations: its own
 * body under the Inventory desk frame. */
export default function InventoryReasonCodesPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
            <LoadingSpinner size="lg" className="text-text-muted" />
          </div>
        }
      >
        <ReasonCodesManagementTab />
      </Suspense>
    </div>
  );
}
