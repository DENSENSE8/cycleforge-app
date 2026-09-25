/**
 * Server paint seed for the mobile receiving feed (`/m/home`, `/m/receiving`,
 * `/m/triage`).
 *
 * The feed is the phone's whole screen and its largest contentful element. It
 * used to arrive strictly after hydration: the query is gated on
 * `enabled: isMobile`, and `isMobile` only resolves once `UIModeProvider` has
 * mounted on the client — so the request could not even be ISSUED until the
 * bundle had downloaded, parsed and hydrated, and the document meanwhile
 * server-rendered the empty state ("No packages yet"). Measured on the mobile
 * Lighthouse profile: FCP ~1.3s, LCP ~9.9s, with the whole gap being that
 * waterfall.
 *
 * Seeding the same key server-side puts the rows in the first HTML, so the feed
 * paints with the document and the client's own refetch (`refetchOnMount:
 * 'always'`) reconciles it exactly as before.
 *
 * Scope discipline, same as `unbox-shell-seed.server.ts`: this is a PAINT seed,
 * not a data source. Every failure path returns `null` and the client fetches
 * exactly as it did before, so a seed problem degrades to the old behaviour
 * rather than an error page.
 */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import { isNextDynamicUsage } from '@/lib/kiosk/next-dynamic-usage';
import { serverSelfFetch } from '@/lib/observability/server-self-fetch';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  MOBILE_FEED_SEED_LIMIT,
  mobileFeedParams,
  mobileFeedQueryKey,
  type MobileFeedSurface,
} from '@/lib/receiving/mobile-feed-query-key';

interface ListPayload {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
}

export async function seedMobileReceivingFeed(
  surface: MobileFeedSurface,
): Promise<DehydratedState | null> {
  try {
    // No `include=serials`. Serials are a second query on the API side and
    // nothing on the first screen renders one — the client's refetch brings
    // them. Measured against this repo's remote database, dropping them roughly
    // halved the seed's cost, and the seed is paid inside TTFB.
    const params = mobileFeedParams(surface, MOBILE_FEED_SEED_LIMIT);
    params.delete('include');
    const res = await serverSelfFetch(`/api/receiving-lines?${params.toString()}`);
    if (!res.ok) return null;
    const json = (await res.json()) as ListPayload;
    const rows = Array.isArray(json.receiving_lines) ? json.receiving_lines : [];
    if (rows.length === 0) return null;

    const client = new QueryClient();
    client.setQueryData([...mobileFeedQueryKey(surface)], rows);
    return dehydrate(client);
  } catch (error) {
    // Next's static-prerender bailout (`cookies()`) must escape, or the build
    // marks the route static and serves `seed: null` forever.
    if (isNextDynamicUsage(error)) throw error;
    console.error('seedMobileReceivingFeed failed; client will fetch', error);
    return null;
  }
}
