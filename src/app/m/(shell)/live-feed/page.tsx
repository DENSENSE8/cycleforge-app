import { Suspense } from 'react';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { LiveFeedBoard } from '@/features/live-feed/LiveFeedBoard';
import { requirePermission } from '@/lib/auth/page-guard';
import { loadLiveFeedBoard } from '@/lib/live-feed/load';
import { liveFeedBoardQueryKey } from '@/lib/live-feed/query';
import { readLiveFeedFilters } from '@/lib/live-feed/route';
import { LIVE_FEED_PERMISSION } from '@/lib/live-feed/stages';

export const dynamic = 'force-dynamic';

/**
 * `/m/live-feed` — the Live feed on a phone: stage tabs over one column, a
 * package opens as a full-screen sheet with its journey, tags and comments.
 * Same board, same reads as `/operations/live-feed`; "Mine" is `?staff=<me>`.
 */
export default async function MobileLiveFeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission([LIVE_FEED_PERMISSION]);
  const raw = await searchParams;
  const filters = readLiveFeedFilters({ get: (name) => [raw[name]].flat()[0] ?? null });

  const queryClient = new QueryClient();
  try {
    queryClient.setQueryData(liveFeedBoardQueryKey(filters), await loadLiveFeedBoard(user.organizationId, filters));
  } catch (error) {
    console.error('MobileLiveFeedPage seed failed; client will fetch', error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={null}>
        <LiveFeedBoard surface="phone" viewerStaffId={user.staffId} />
      </Suspense>
    </HydrationBoundary>
  );
}
