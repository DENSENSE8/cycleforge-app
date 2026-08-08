/**
 * Server seed for the `/incoming` desk — dehydrates the exact `full`-phase key
 * `useReceivingLinesQuery` mounts with on bare `/incoming`, so the Inbound grid
 * paints rows on the first HTML frame instead of hydrating → firing one
 * client-side fetch → skeleton (the "feels broken" symptom). Mirrors
 * `seedUnboxSpine`; Incoming has no spine phase, so it seeds `full` directly.
 *
 * Bare `/incoming` shares the default receiving context object (all mode-specific
 * facets null/empty). A tenant that lands with filter params in the URL just
 * misses the seed and fetches client-side — no worse than before, never wrong.
 */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import { RECEIVING_MODES } from '@/lib/receiving/receiving-modes';
import { DEFAULT_UNBOX_CONTEXT as DEFAULT_RECEIVING_CONTEXT } from '@/lib/receiving/default-unbox-context';
import { serverSelfFetch } from '@/lib/observability/server-self-fetch';

interface IncomingSeed {
  state: DehydratedState;
}

/**
 * Hard bound on the server-side seed fetch. Unlike `/unbox` (which seeds the
 * cheap `?phase=spine`), Incoming seeds the authoritative `full` list, so a slow
 * `/api/receiving-lines` here would block `incoming/loading.tsx` server-side —
 * trading a client skeleton-hang for a server spinner-hang. Bounding it keeps
 * the RSC render fast: on a quick response the grid paints rows on first HTML;
 * on a slow one the seed bails, the page renders immediately, and the client
 * fetches with its OWN bound (`RECEIVING_LINES_FETCH_TIMEOUT_MS`) + degraded
 * state. Shorter than the client bound on purpose — the seed is a bonus, the
 * client is the safety net.
 */
const SEED_FETCH_TIMEOUT_MS = 3_000;

/** Prefetch the bare `/incoming` list (`full` phase). Soft-fail — client still fetches. */
export async function seedIncomingLines(
  ctx = DEFAULT_RECEIVING_CONTEXT,
): Promise<IncomingSeed> {
  const queryClient = new QueryClient();
  const mode = RECEIVING_MODES.incoming;
  // Same params + key the client's `full` query builds (receivingLinesTableQuery
  // full === mode.buildParams / mode.queryKey), so the cache entry matches byte
  // for byte and hydration serves it with no refetch.
  const params = mode.buildParams(ctx);
  const key = mode.queryKey(ctx);

  try {
    const res = await serverSelfFetch(`/api/receiving-lines?${params.toString()}`, {
      signal: AbortSignal.timeout(SEED_FETCH_TIMEOUT_MS),
    });
    if (res.ok) {
      const data = await res.json();
      queryClient.setQueryData(key, data);
    }
  } catch (error) {
    console.error('seedIncomingLines skipped (slow/failed); client will fetch', error);
  }

  return { state: dehydrate(queryClient) };
}
