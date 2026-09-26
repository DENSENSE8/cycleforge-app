/** Server seed for the To-ship Unshipped queue — Packer-style dehydrate so the desk's `useQuery(unshippedOrdersQuery(…))` paints from cache… */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { normalizeUnshippedOrdersPayload } from '@/lib/orders/order-record-normalize';
import { isNextDynamicUsage } from '@/lib/kiosk/next-dynamic-usage';
import { serverSelfFetch } from '@/lib/observability/server-self-fetch';
import {
  normalizeQueueCountsPayload,
  type UnshippedQueueCounts,
} from '@/lib/orders/queue-counts-normalize';
import { DESK_PAIR_PARAM, DESK_QUEUE_PARAM } from '@/lib/outbound/desk-views';
import type { DeskPairFilter, DeskQueueFilter } from '@/lib/orders/desk-view-filters';

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
  queue?: DeskQueueFilter;
}

/** Mirrors `unshippedOrdersQuery`'s key for that mount. */
function unshippedListKey({ blockedOnly = false, pair, queue }: UnshippedSeedView) {
  return [
    'dashboard-table',
    'unshipped',
    {
      searchQuery: '',
      packedBy: undefined,
      testedBy: undefined,
      staffId: undefined,
      strictSearchScope: true,
      stage: null,
      blockedOnly,
      pair,
      queue,
      limit: UNSHIPPED_SEED_LIMIT,
    },
  ] as const;
}

function unshippedCountsKey() {
  return ['dashboard-table', 'unshipped-counts', { staffId: null }] as const;
}

async function fetchUnshippedRows({ blockedOnly, pair, queue }: UnshippedSeedView): Promise<ShippedOrder[] | null> {
  // Must match `fetchUnshippedOrdersData` (inWarehouse), not fulfillmentScope.
  const params = new URLSearchParams({
    inWarehouse: 'true',
    listShape: 'queue',
    limit: String(UNSHIPPED_SEED_LIMIT),
  });
  // Same params `fetchUnshippedOrdersData` sends for this view.
  if (blockedOnly) params.set('blockedOnly', 'true');
  if (pair) params.set(DESK_PAIR_PARAM, pair);
  if (queue) params.set(DESK_QUEUE_PARAM, queue);
  const res = await serverSelfFetch(`/api/orders?${params.toString()}`);
  if (!res.ok) {
    // 401/403: no session on the self-fetch (sign-in / cold cookie). Soft miss —
    // do not throw; throwing still surfaces in Next's error overlay via
    // allSettled → console.error even though the page keeps working.
    if (res.status !== 401 && res.status !== 403) {
      console.warn(`seedUnshippedQueue list soft-fail: ${res.status}`);
    }
    return null;
  }
  const data = (await res.json()) as { orders?: unknown[] };
  return normalizeUnshippedOrdersPayload(data.orders || []);
}

/** Seeded counts MUST be the same shape the browser fetch produces — this key is read by the KPI band, and a seed that narrows the payload… */
async function fetchUnshippedCounts(): Promise<UnshippedQueueCounts | null> {
  const res = await serverSelfFetch('/api/orders/queue-counts');
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return normalizeQueueCountsPayload(data);
}

/** Prefetch unshipped list (+ counts when available). */
export async function seedUnshippedQueue(view: UnshippedSeedView = {}): Promise<UnshippedQueueSeed> {
  const queryClient = new QueryClient();
  let rows: ShippedOrder[] = [];

  const [listResult, countsResult] = await Promise.allSettled([
    fetchUnshippedRows(view),
    fetchUnshippedCounts(),
  ]);
  // `allSettled` would otherwise swallow Next's static-prerender bailout.
  for (const result of [listResult, countsResult]) {
    if (result.status === 'rejected' && isNextDynamicUsage(result.reason)) throw result.reason;
  }

  if (listResult.status === 'fulfilled') {
    if (listResult.value != null) {
      rows = listResult.value;
      queryClient.setQueryData(unshippedListKey(view), rows);
    }
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
