'use client';

/**
 * State + side-effect hooks extracted from the former `DashboardSidebar` God
 * component. Each owns a single responsibility so the sidebar shell and the
 * route-context panels stay thin and presentational.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type { ShippedFormData } from '@/components/shipped';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import {
  insertUnshippedOrderIntoCache,
  invalidateUnshippedCounts,
} from '@/lib/queries/dashboard-cache-patch';


/** The signed-in user's permissions as a `Set` for O(1) lookups, or `undefined` while auth is still resolving or the user is signed out. */
export function useAuthPermissions(): Set<string> | undefined {
  const { user, isLoaded } = useAuth();
  return useMemo<Set<string> | undefined>(() => {
    if (!isLoaded || !user) return undefined;
    return new Set(user.permissions);
  }, [isLoaded, user]);
}


/** Returns a submit handler for the shared shipped/order intake form. */
export function useShippedFormSubmit(
  onSuccess: () => void,
): (data: ShippedFormData) => Promise<void> {
  const queryClient = useQueryClient();
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
                  shippingTrackingNumbers: data.shipping_tracking_numbers ?? null,
                  sku: data.sku || null,
                  accountSource: data.accountSource?.trim() || 'Manual',
                  typeSlug: data.typeSlug || null,
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
        if (data.mode === 'add_order' && result.order) {
          insertUnshippedOrderIntoCache(queryClient, result.order);
          invalidateUnshippedCounts(queryClient);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('unshipped-order-added', { detail: result.order }),
            );
          }
          onSuccess();
          return;
        }
        onSuccess();
        refreshDomains(REFRESH_BUNDLES.outboundOrderWrite);
      } catch {
        toast.error('Error submitting form. Please try again.');
      }
    },
    [onSuccess, queryClient],
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
