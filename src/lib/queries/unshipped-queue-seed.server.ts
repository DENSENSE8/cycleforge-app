/**
 * Server seed for the To-ship Unshipped queue — Packer-style dehydrate so the
 * desk's `useQuery(unshippedOrdersQuery(…))` paints from cache on first byte.
 *
 * Reads IN-PROCESS under the signed-in staffer's org, through the same domain
 * functions `/api/orders` and `/api/orders/queue-counts` call. The seed used
 * to self-fetch those routes over HTTP; the fetch resolved its origin from
 * NEXT_PUBLIC_APP_URL (another deployment), got 401 for the lane cookie,
 * swallowed it, and the desk painted empty (phase0-findings §3.4).
 */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { normalizeUnshippedOrdersPayload } from '@/lib/orders/order-record-normalize';
import { isNextDynamicUsage } from '@/lib/kiosk/next-dynamic-usage';
import { getCurrentUser } from '@/lib/auth/current-user';
import { parseOrdersListQuery } from '@/lib/orders/orders-list-query';
import { listOrders } from '@/lib/orders/orders-list';
import { getQueueCounts } from '@/lib/orders/queue-counts';
import { normalizeQueueCountsPayload } from '@/lib/orders/queue-counts-normalize';
import { DESK_PAIR_PARAM } from '@/lib/outbound/desk-views';
import type { DeskPairFilter } from '@/lib/orders/desk-view-filters';
import type { OrgId } from '@/lib/tenancy/constants';

/** Default page size — keep in lockstep with `UnshippedTable` `rowLimit` initial. */
const UNSHIPPED_SEED_LIMIT = 200;

interface UnshippedQueueSeed {
  state: DehydratedState;
  rows: ShippedOrder[];
}

/** Which queue view the page mounts — the server-filtered facts of its key. */
interface UnshippedSeedView {
  /** Shortage desk (`lockedFulfillmentState="BLOCKED"`). */
  blockedOnly?: boolean;
  pair?: DeskPairFilter;
}

/** Mirrors `unshippedOrdersQuery`'s key for that mount. */
function unshippedListKey({ blockedOnly = false, pair }: UnshippedSeedView) {
  return [
    'dashboard-table',
    'unshipped',
    {
      searchQuery: '',
      packedBy: undefined,
      pickerId: undefined,
      staffId: undefined,
      strictSearchScope: true,
      stage: null,
      blockedOnly,
      pair,
      limit: UNSHIPPED_SEED_LIMIT,
    },
  ] as const;
}

function unshippedCountsKey() {
  return ['dashboard-table', 'unshipped-counts', { staffId: null }] as const;
}

async function readUnshippedRows(
  orgId: OrgId,
  { blockedOnly, pair }: UnshippedSeedView,
): Promise<ShippedOrder[]> {
  // The exact params `fetchUnshippedOrdersData` sends for this view (inWarehouse, not fulfillmentScope).
  const params = new URLSearchParams({
    inWarehouse: 'true',
    listShape: 'queue',
    limit: String(UNSHIPPED_SEED_LIMIT),
  });
  if (blockedOnly) params.set('blockedOnly', 'true');
  if (pair) params.set(DESK_PAIR_PARAM, pair);
  const { payload } = await listOrders(orgId, parseOrdersListQuery(params));
  // Wire shape, not driver shape: the browser fetch receives JSON (timestamps
  // as strings), and both writers share one cache key.
  const wireRows = JSON.parse(JSON.stringify(payload.orders)) as unknown[];
  return normalizeUnshippedOrdersPayload(wireRows);
}

/** Prefetch unshipped list (+ counts when available). */
export async function seedUnshippedQueue(view: UnshippedSeedView = {}): Promise<UnshippedQueueSeed> {
  const queryClient = new QueryClient();
  let rows: ShippedOrder[] = [];

  // Same gate the two routes apply (withAuth + `orders.view`). A miss is
  // logged, never silent: an unseeded desk paints empty until hydration.
  let user: Awaited<ReturnType<typeof getCurrentUser>>;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (isNextDynamicUsage(error)) throw error;
    console.warn('seedUnshippedQueue: session lookup failed; client will fetch', error);
    return { state: dehydrate(queryClient), rows };
  }
  if (!user) {
    console.warn('seedUnshippedQueue: no session on the page request; client will fetch');
    return { state: dehydrate(queryClient), rows };
  }
  if (!user.permissions.has('orders.view')) {
    console.warn(`seedUnshippedQueue: staff ${user.staffId} lacks orders.view; not seeding`);
    return { state: dehydrate(queryClient), rows };
  }
  const orgId = user.organizationId as OrgId;

  const [listResult, countsResult] = await Promise.allSettled([
    readUnshippedRows(orgId, view),
    // Same normalizer as the browser fetch: the KPI band reads this key, and a
    // seed that narrowed the payload once zeroed the bench chips for a TTL.
    getQueueCounts(orgId, { staffId: null }).then(({ payload }) => normalizeQueueCountsPayload(payload)),
  ]);
  // `allSettled` would otherwise swallow Next's static-prerender bailout.
  for (const result of [listResult, countsResult]) {
    if (result.status === 'rejected' && isNextDynamicUsage(result.reason)) throw result.reason;
  }

  if (listResult.status === 'fulfilled') {
    rows = listResult.value;
    queryClient.setQueryData(unshippedListKey(view), rows);
  } else {
    console.warn('seedUnshippedQueue list failed; client will fetch', listResult.reason);
  }

  if (countsResult.status === 'fulfilled') {
    if (countsResult.value != null) {
      queryClient.setQueryData(unshippedCountsKey(), countsResult.value);
    }
  } else {
    console.warn('seedUnshippedQueue counts failed; client will fetch', countsResult.reason);
  }

  return { state: dehydrate(queryClient), rows };
}
