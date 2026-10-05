import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import type { PackerRecord } from '@/hooks/usePackerLogs';
import { getCurrentUser } from '@/lib/auth/current-user';
import { isNextDynamicUsage } from '@/lib/kiosk/next-dynamic-usage';
import { fetchPackerLogRows } from '@/lib/neon/packer-logs-week';
import {
  shippedFeedQueryKey,
  SHIPPED_FEED_PAGE_SIZE,
  SHIPPED_FEED_PHASE,
} from '@/lib/shipping/shipped-feed-config';
import type { ShippedTypeFilter } from '@/lib/shipping/shipped-filter/shipped-filter-constants';

export interface ShippedLedgerSeed {
  state: DehydratedState;
  shippedFilter: ShippedTypeFilter;
}

/**
 * First package page for `/fulfilled`, read in-process under the signed-in
 * tenant. Its key/shape mirrors the browser's default all-time query.
 */
export async function seedShippedLedger(shippedFilter: ShippedTypeFilter): Promise<ShippedLedgerSeed> {
  const queryClient = new QueryClient();
  let user: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (isNextDynamicUsage(error)) throw error;
    console.warn('seedShippedLedger: session lookup failed; client will fetch', error);
    return { state: dehydrate(queryClient), shippedFilter };
  }

  if (!user) {
    console.warn('seedShippedLedger: no session on the page request; client will fetch');
    return { state: dehydrate(queryClient), shippedFilter };
  }
  if (!user.permissions.has('packing.view')) {
    console.warn(`seedShippedLedger: staff ${user.staffId} lacks packing.view; not seeding`);
    return { state: dehydrate(queryClient), shippedFilter };
  }

  try {
    const result = await fetchPackerLogRows({
      organizationId: user.organizationId,
      limit: SHIPPED_FEED_PAGE_SIZE,
      shippedFilters: {
        type: shippedFilter,
        carrier: null,
        statusCategory: null,
        exceptionsOnly: false,
        channels: [],
        cardStatus: [],
      },
      spineOnly: true,
    });
    // Match the browser fetch's JSON wire shape before dehydrating the cache.
    const rows = JSON.parse(JSON.stringify(result.rows)) as PackerRecord[];
    queryClient.setQueryData(
      shippedFeedQueryKey({
        shippedFilter,
        limit: SHIPPED_FEED_PAGE_SIZE,
        phase: SHIPPED_FEED_PHASE,
      }),
      rows,
    );
    return {
      state: dehydrate(queryClient),
      shippedFilter,
    };
  } catch (error) {
    if (isNextDynamicUsage(error)) throw error;
    console.warn('seedShippedLedger: package seed failed; client will fetch', error);
    return { state: dehydrate(queryClient), shippedFilter };
  }
}
