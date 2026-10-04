import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { LiveFeedView } from '@/components/live-feed/LiveFeedBoard';
import { requirePermission } from '@/lib/auth/page-guard';
import { loadLiveFeedBoard } from '@/lib/live-feed/load';
import { liveFeedBoardQueryKey } from '@/lib/live-feed/query';
import { defaultLiveFeedFilters, liveFeedHref, readLiveFeedFilters } from '@/lib/live-feed/route';
import { LIVE_FEED_PERMISSIONS, liveFeedAccess } from '@/lib/live-feed/statuses';

export const metadata: Metadata = {
  title: 'Live feed',
};

export const dynamic = 'force-dynamic';

/**
 * `/operations/live-feed` — Operations › Live feed: every package, pickup and
 * counter sale by status, online and in person, inbound and outbound, as the
 * direction's board (one lane per status). The date range sits top-right in
 * the header; every other control is in the contextual sidebar (direction
 * views, Date by, staff, time of day, Channel, Carrier, Find). Open to
 * whoever sees either direction (packing.view outbound, receiving.view
 * inbound); a direction the viewer may not see lands on the other's board.
 */
export default async function LiveFeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission(LIVE_FEED_PERMISSIONS);
  const raw = await searchParams;
  const filters = readLiveFeedFilters({
    get: (name) => {
      const value = raw[name];
      return (Array.isArray(value) ? value[0] : value) ?? null;
    },
  });
  if (!liveFeedAccess(user.permissions)[filters.dir]) {
    redirect(liveFeedHref(defaultLiveFeedFilters(filters.dir === 'outbound' ? 'inbound' : 'outbound')));
  }

  const queryClient = new QueryClient();
  try {
    const board = await loadLiveFeedBoard(user.organizationId, filters, user.permissions);
    if (board) queryClient.setQueryData(liveFeedBoardQueryKey(filters), board);
  } catch (error) {
    console.error('LiveFeedPage seed failed; client will fetch', error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {/* The board runs edge to edge — the desk's full measure. */}
      <DeskPageLayout bare measure="full" className="h-full min-h-0">
        <LiveFeedView />
      </DeskPageLayout>
    </HydrationBoundary>
  );
}
