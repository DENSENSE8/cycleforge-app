/** Server paint seed for the mobile receiving feed (`/m/home`, `/m/receiving`, `/m/triage`). */
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
    // No `include=serials`.
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
