'use client';

/**
 * Fixed bottom-right product-updates host.
 *
 * Mounted once in the root layout (beside the existing toasters) so the first
 * mount is a full document load. Client-side Next navigations do not remount
 * this host and therefore do not re-pop the panel.
 *
 * Auth: signed-in staff (`user.staffId`). Warehouse stations see updates;
 * dashboard.view is not required. Kiosk / signed-out renders nothing.
 */

import { useAuth } from '@/contexts/AuthContext';
import { ProductUpdatesChip } from './ProductUpdatesChip';
import { ProductUpdatesPanel } from './ProductUpdatesPanel';
import { useProductUpdates } from './useProductUpdates';

export function ProductUpdatesHost() {
  const { isLoaded, user } = useAuth();
  if (!isLoaded || !user?.staffId) return null;
  return <ProductUpdatesHostInner />;
}

function ProductUpdatesHostInner() {
  const { latest, open, staleDeploy, prefsLoading, dismiss, reopen, refresh } =
    useProductUpdates();

  if (prefsLoading || !latest) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-fab flex flex-col items-end gap-2">
      {staleDeploy && open ? (
        <div className="pointer-events-auto">
          <ProductUpdatesChip staleDeploy onOpen={reopen} onRefresh={refresh} />
        </div>
      ) : null}
      <div className="pointer-events-auto">
        {open ? (
          <ProductUpdatesPanel update={latest} onDismiss={dismiss} />
        ) : (
          <ProductUpdatesChip
            staleDeploy={staleDeploy}
            onOpen={reopen}
            onRefresh={refresh}
          />
        )}
      </div>
    </div>
  );
}
