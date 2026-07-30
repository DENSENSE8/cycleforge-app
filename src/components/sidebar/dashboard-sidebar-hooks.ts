'use client';

/**
 * State + side-effect hooks extracted from the former `DashboardSidebar` God
 * component. Each owns a single responsibility so the sidebar shell and the
 * route-context panels stay thin and presentational.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useEventBridge } from '@/hooks';
import type { ShippedFormData } from '@/components/shipped';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';


/**
 * The signed-in user's permissions as a `Set` for O(1) lookups, or `undefined`
 * while auth is still resolving or the user is signed out. Returning
 * `undefined` (rather than an empty set) lets the nav render unfiltered during
 * the legacy `?staffId=…` rollout flow.
 */
export function useAuthPermissions(): Set<string> | undefined {
  const { user, isLoaded } = useAuth();
  return useMemo<Set<string> | undefined>(() => {
    if (!isLoaded || !user) return undefined;
    return new Set(user.permissions);
  }, [isLoaded, user]);
}


/**
 * Wires the cross-pane `open-shipped-details` / `close-shipped-details` window
 * event bridge that sibling tables dispatch, and resets on real route changes.
 *
 * The details panel itself is a fixed overlay rendered elsewhere, so the only
 * observable effect here is `onActivate` (used to close the mobile drawer when
 * a details panel opens). The internal open flag is retained to preserve the
 * legacy reset semantics.
 *
 * @param onActivate Called when a details panel opens (e.g. close the drawer).
 */
export function useStationDetailsPanel(onActivate?: () => void): void {
  const pathname = usePathname();
  const [, setStationDetailsOpen] = useState(false);
  const prevPathnameRef = useRef(pathname);

  // Only reset on actual route changes, not search-param updates.
  useEffect(() => {
    if (!pathname) return;
    if (prevPathnameRef.current !== pathname) {
      setStationDetailsOpen(false);
      prevPathnameRef.current = pathname;
    }
  }, [pathname]);

  useEventBridge({
    'open-shipped-details': () => {
      setStationDetailsOpen(true);
      onActivate?.();
    },
    'close-shipped-details': () => setStationDetailsOpen(false),
  });
}

/**
 * Returns a submit handler for the shared shipped/order intake form. Routes
 * `add_order` to `/api/orders/add` and everything else to `/api/shipped/submit`,
 * then fires the dashboard/station refresh events on success.
 *
 * @param onSuccess Called after a successful submit (e.g. close the intake form).
 */
export function useShippedFormSubmit(
  onSuccess: () => void,
): (data: ShippedFormData) => Promise<void> {
  return useCallback(
    async (data: ShippedFormData) => {
      try {
        // Per-submit key so a flaky-network retry of the same click replays
        // instead of inserting a second order (see orders.add idempotency).
        const idempotencyKey = safeRandomUUID();
        const response =
          data.mode === 'add_order'
            ? await fetch('/api/orders/add', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify({
                  orderId: data.order_id,
                  productTitle: data.product_title,
                  shippingTrackingNumber: data.shipping_tracking_number,
                  sku: data.sku || null,
                  accountSource: 'Manual',
                  condition: data.condition,
                  idempotencyKey,
                }),
              })
            : await fetch('/api/shipped/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
              });

        const result = await response.json();
        if (!result.success) {
          toast.error(result.error || 'Failed to submit form. Please try again.');
          return;
        }
        onSuccess();
        refreshDomains(REFRESH_BUNDLES.outboundOrderWrite);
      } catch {
        toast.error('Error submitting form. Please try again.');
      }
    },
    [onSuccess],
  );
}

/** Mutate the current URL's search params. `nextPathname` defaults to the live path. */
export type SidebarSearchMutator = (
  mutate: (params: URLSearchParams) => void,
  nextPathname?: string,
) => void;

/**
 * `pathname`-aware search-param navigator for non-dashboard routes (e.g. admin
 * section deep-links). Unlike the dashboard search controller, this preserves
 * the current path when no explicit target is given.
 */
export function useSidebarSearchNavigation(): SidebarSearchMutator {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  return useCallback<SidebarSearchMutator>(
    (mutate, nextPathname) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      mutate(nextParams);
      const targetPath = nextPathname || pathname || '/dashboard';
      const nextSearch = nextParams.toString();
      router.replace(nextSearch ? `${targetPath}?${nextSearch}` : targetPath);
    },
    [pathname, router, searchParams],
  );
}
