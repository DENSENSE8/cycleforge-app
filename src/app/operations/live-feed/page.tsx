import type { Metadata } from 'next';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { LiveFeedBoard } from '@/features/live-feed/LiveFeedBoard';
import { requirePermission } from '@/lib/auth/page-guard';
import { loadLiveFeedBoard } from '@/lib/live-feed/load';
import { liveFeedBoardQueryKey } from '@/lib/live-feed/query';
import { readLiveFeedFilters } from '@/lib/live-feed/route';
import { LIVE_FEED_PERMISSION } from '@/lib/live-feed/stages';

export const metadata: Metadata = {
  title: 'Live feed',
};

export const dynamic = 'force-dynamic';

/**
 * `/operations/live-feed` — Operations › Live feed: every outbound carrier
 * package by stage (To pick → Picked → Packed → Scanned out), live, for today.
 * The sidebar's facets / staff filter narrow it (URL params). The server seeds
 * the board so it paints with its first load.
 */
export default async function LiveFeedPage({
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
    console.error('LiveFeedPage seed failed; client will fetch', error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DeskPageLayout bare measure="full" className="h-full min-h-0">
        <LiveFeedBoard surface="desk" viewerStaffId={user.staffId} />
      </DeskPageLayout>
    </HydrationBoundary>
  );
}
