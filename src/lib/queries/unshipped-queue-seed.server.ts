/**
 * Server seed for the To-ship Unshipped queue — Packer-style dehydrate so the
 * desk's `useQuery(unshippedOrdersQuery(…))` paints from cache on first HTML.
 *
 * Key + limit must match {@link UnshippedTable}'s default mount
 * (`strictSearchScope: true`, `limit: 200`, empty search, no stage).
 */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { normalizeUnshippedOrdersPayload } from '@/lib/orders/order-record-normalize';
import { serverSelfFetch } from '@/lib/observability/server-self-fetch';
import {
  normalizeQueueCountsPayload,
  type UnshippedQueueCounts,
} from '@/lib/orders/queue-counts-normalize';

/** Default page size — keep in lockstep with `UnshippedTable` `rowLimit` initial. */
const UNSHIPPED_SEED_LIMIT = 200;

interface UnshippedQueueSeed {
  state: DehydratedState;
  rows: ShippedOrder[];
}

function unshippedListKey() {
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
      limit: UNSHIPPED_SEED_LIMIT,
    },
  ] as const;
}

function unshippedCountsKey() {
  return ['dashboard-table', 'unshipped-counts', { staffId: null }] as const;
}

async function fetchUnshippedRows(): Promise<ShippedOrder[]> {
  const params = new URLSearchParams({
    fulfillmentScope: 'true',
    listShape: 'queue',
    limit: String(UNSHIPPED_SEED_LIMIT),
  });
  const res = await serverSelfFetch(`/api/orders?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`unshipped seed failed: ${res.status}`);
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
 */
export async function seedUnshippedQueue(): Promise<UnshippedQueueSeed> {
  const queryClient = new QueryClient();
  let rows: ShippedOrder[] = [];

  try {
    rows = await fetchUnshippedRows();
    queryClient.setQueryData(unshippedListKey(), rows);
  } catch (error) {
    console.error('seedUnshippedQueue list failed; client will fetch', error);
  }

  try {
    const counts = await fetchUnshippedCounts();
    if (counts != null) {
      queryClient.setQueryData(unshippedCountsKey(), counts);
    }
  } catch (error) {
    console.error('seedUnshippedQueue counts failed; client will fetch', error);
  }

  return { state: dehydrate(queryClient), rows };
}
