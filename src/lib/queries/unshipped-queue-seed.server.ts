/**
 * Server seed for the To-ship Unshipped queue — Packer-style dehydrate so the
 * desk's `useQuery(unshippedOrdersQuery(…))` paints from cache on first HTML.
 *
 * Key + limit must match {@link UnshippedTable}'s mount for the page's view
 * (`strictSearchScope: true`, `limit: 200`, empty search, no stage, plus the
 * desk's `blockedOnly` and desk-sidebar lens — `pair` / `queue`).
 */
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
  // fulfillmentScope ignores dock SHIP_CONFIRM, so a seed of never-packed rows
  // painted hundreds of already-scanned-out orders against a queue-counts
  // denominator of the unlabeled leftovers ("171 of 2").
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

/**
 * Seeded counts MUST be the same shape the browser fetch produces — this key is
 * read by the KPI band, and a seed that narrows the payload wins first paint and
 * then holds for the query's whole staleTime. Normalizing through the shared
 * waist is what keeps the two writers from drifting (it drifted once already:
 * a hand-narrowed seed dropped `packPlacement`, so "At stations" and the
 * per-bench chips read zero benches for the first 60s on every load).
 */
async function fetchUnshippedCounts(): Promise<UnshippedQueueCounts | null> {
  const res = await serverSelfFetch('/api/orders/queue-counts');
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return normalizeQueueCountsPayload(data);
}

/**
 * Prefetch unshipped list (+ counts when available). Failures are soft — the
 * client desk still hydrates via `/api/orders`.
 *
 * The two fetches are INDEPENDENT and run CONCURRENTLY. They used to be two
 * sequential `await`s, which serialized two full HTTP round trips back into
 * this same process and put their sum on the RSC's critical path for no
 * ordering reason — neither reads the other's result, and they write different
 * cache keys.
 *
 * `allSettled`, never `all`: the per-call soft-failure contract is load-bearing
 * here. `Promise.all` short-circuits on the first rejection, so a failing list
 * would discard an already-resolved counts payload (and vice versa) and hand
 * the desk an emptier seed than the one it actually paid for. Each result is
 * still consumed under its own branch, so one failing seeds the other.
 */
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
