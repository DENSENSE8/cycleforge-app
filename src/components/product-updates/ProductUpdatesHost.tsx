'use client';

/**
 * Fixed bottom-right product-updates host.
 *
 * Mounted once in the root layout (beside the existing toasters) so the first
 * mount is a full document load. Client-side Next navigations do not remount
 * this host and therefore do not re-pop the panel.
 *
 * One-shot: an unseen update auto-opens the panel and Got it retires the
 * corner — no residual "What's new" chip, no reopen. Only a stale-deploy
 * refresh chip may claim the corner afterwards; the full changelog is
 * /release-notes.
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
  const { latest, open, staleDeploy, prefsLoading, dismiss, refresh } =
    useProductUpdates();

  if (prefsLoading || !latest) return null;
  if (!open && !staleDeploy) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-fab flex flex-col items-end gap-2">
      {staleDeploy ? (
        <div className="pointer-events-auto">
          <ProductUpdatesChip onRefresh={refresh} />
        </div>
      ) : null}
      {open ? (
        <div className="pointer-events-auto">
          <ProductUpdatesPanel update={latest} onDismiss={dismiss} />
        </div>
      ) : null}
    </div>
  );
}
