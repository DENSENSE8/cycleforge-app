/**
 * Server seeds for Unbox receiving-lines spine — dehydrate the same keys
 * `useReceivingLinesQuery` mounts with so browse paints from cache on first HTML.
 *
 * - {@link seedUnboxQueue} — bare `/unbox` default tab (Queue · spine).
 * - {@link seedUnboxSpine} — History spine for Arrival (`/triage`) warm cache.
 */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import {
  RECEIVING_MODES,
  type ReceivingModeContext,
  type ReceivingModeDescriptor,
} from '@/lib/receiving/receiving-modes';
import { DEFAULT_UNBOX_CONTEXT } from '@/lib/receiving/default-unbox-context';
import { serverSelfFetch } from '@/lib/observability/server-self-fetch';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { RECEIVING_RAIL_FEEDS } from '@/lib/receiving/rail/feeds';
import { receivingRailQueryKey } from '@/lib/receiving/rail/rail-query-key';
import {
  transformUnboxOpenedRows,
  UNBOX_SIDEBAR_LIMIT,
} from '@/lib/receiving/rail/unbox-opened-rows';

/** Spine paint window — lockstep with `SPINE_PAINT_LIMIT` in receiving-queries. */
const SPINE_PAINT_LIMIT = 150;

interface UnboxQueueSeed {
  state: DehydratedState;
  rows: ReceivingLineRow[];
}

interface UnboxSpineSeed {
  state: DehydratedState;
}

type SpineListPayload = {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
  total: number;
  limit: number;
  offset: number;
};

function buildSpineParams(
  mode: ReceivingModeDescriptor,
  ctx: ReceivingModeContext,
): URLSearchParams {
  const params = mode.buildParams(ctx);
  params.delete('include');
  params.set('phase', 'spine');
  const limit = Number(params.get('limit'));
  if (Number.isFinite(limit) && limit > SPINE_PAINT_LIMIT) {
    params.set('limit', String(SPINE_PAINT_LIMIT));
  }
  return params;
}

async function fetchSpine(
  mode: ReceivingModeDescriptor,
  ctx: ReceivingModeContext,
): Promise<SpineListPayload | null> {
  const params = buildSpineParams(mode, ctx);
  const res = await serverSelfFetch(`/api/receiving-lines?${params.toString()}`);
  if (!res.ok) return null;
  return (await res.json()) as SpineListPayload;
}

/**
 * Prefetch the Unbox "Unboxed" recents rail (`feed=unboxRecent`) into the SAME
 * QueryClient as the Queue spine, so the left resume rail is present in the
 * first-paint HTML (P2 context) instead of cold-fetching after hydration — its
 * only prior seed was the post-hydration Upstash snapshot, so it painted last.
 *
 * The key MUST equal `ReceivingFeedRail`'s DEFAULT mount (scope undefined, empty
 * filter, no `?staff=`) — both funnel through {@link receivingRailQueryKey}, so
 * a non-default mount (an operator with `?staff=` in the URL) simply misses and
 * falls through to the client fetch. The rail shell caches a ROWS ARRAY (its
 * `useQuery<TRow[]>` unwraps `receiving_lines`), so seed the rows, not the
 * `ApiResponse` wrapper. Rows go through the shared transform so the seeded
 * `client_event_id`s match the client fetch and the rail never remounts on
 * reconcile. Soft-fail — the client still fetches on a miss.
 */
async function seedUnboxRecentRail(queryClient: QueryClient): Promise<void> {
  const feed = RECEIVING_RAIL_FEEDS.unboxRecent;
  const key = receivingRailQueryKey(feed.segment, undefined, '', null);
  try {
    const params = new URLSearchParams({
      limit: String(UNBOX_SIDEBAR_LIMIT),
      offset: '0',
      view: 'unbox_opened',
    });
    const res = await serverSelfFetch(`/api/receiving-lines?${params.toString()}`);
    if (!res.ok) return;
    const data = (await res.json()) as { receiving_lines?: ReceivingLineRow[] };
    const rows = transformUnboxOpenedRows(data.receiving_lines ?? []);
    queryClient.setQueryData(key, rows);
  } catch (error) {
    console.error('seedUnboxRecentRail failed; client will fetch', error);
  }
}

/**
 * Prefetch Queue spine for bare `/unbox`. Soft-fail — client still fetches.
 * Returns dehydrate state + rows for the RSC first-paint stand-in. The dehydrate
 * state also carries the recents-rail seed ({@link seedUnboxRecentRail}), which
 * rides along in the same QueryClient so `/unbox` needs no structural change.
 */
export async function seedUnboxQueue(
  ctx = DEFAULT_UNBOX_CONTEXT,
): Promise<UnboxQueueSeed> {
  const queryClient = new QueryClient();
  const mode = RECEIVING_MODES.unbox_queue;
  const spineKey = [...mode.queryKey(ctx), 'spine'] as const;
  let rows: ReceivingLineRow[] = [];

  try {
    const data = await fetchSpine(mode, ctx);
    if (data) {
      queryClient.setQueryData(spineKey, data);
      rows = Array.isArray(data.receiving_lines) ? data.receiving_lines : [];
    }
  } catch (error) {
    console.error('seedUnboxQueue failed; client will fetch', error);
  }

  // Ride the recents rail into the same dehydrate state (P2 context paint).
  await seedUnboxRecentRail(queryClient);

  return { state: dehydrate(queryClient), rows };
}

/**
 * Prefetch History spine (`?phase=spine`) for Arrival warm cache.
 * Soft-fail — client still fetches.
 */
export async function seedUnboxSpine(
  ctx = DEFAULT_UNBOX_CONTEXT,
): Promise<UnboxSpineSeed> {
  const queryClient = new QueryClient();
  const mode = RECEIVING_MODES.history;
  const spineKey = [...mode.queryKey(ctx), 'spine'] as const;

  try {
    const data = await fetchSpine(mode, ctx);
    if (data) {
      queryClient.setQueryData(spineKey, data);
    }
  } catch (error) {
    console.error('seedUnboxSpine failed; client will fetch', error);
  }

  return { state: dehydrate(queryClient) };
}
