import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { QueryClient, HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { PackerPageContent } from '@/components/packer/PackerPageContent';
import { SurfaceGate } from '@/components/surfaces/SurfaceGate';
import { getCurrentUser } from '@/lib/auth/current-user';
import { computeWeekRange } from '@/utils/date';
import { fetchPackerLogRows } from '@/lib/neon/packer-logs-week';

/** Shared Packing-surface page shell — mounted by BOTH `/packer` (legacy) and `/pack` (the first-class Pack surface, Studio-driven operator… */
export async function PackerSurfacePage({
  fallbackPath = '/pack',
}: {
  /** Path used to build the `?next=` on the belt-and-suspenders signin redirect. */
  fallbackPath?: string;
}) {
  const user = await getCurrentUser();
  if (!user) {
    const h = await headers();
    const path = h.get('x-pathname') || fallbackPath;
    redirect(`/signin?next=${encodeURIComponent(path)}`);
  }

  const packerId = Number(user.staffId);
  const weekRange = computeWeekRange(0);

  const queryClient = new QueryClient();
  try {
    await queryClient.prefetchQuery({
      queryKey: [
        'packer-logs',
        packerId,
        { weekStart: weekRange.startStr, weekEnd: weekRange.endStr },
      ],
      queryFn: async () => {
        const { rows } = await fetchPackerLogRows({
          organizationId: user.organizationId,
          packerId,
          limit: 1000,
          weekStart: weekRange.startStr,
          weekEnd: weekRange.endStr,
        });
        return rows;
      },
    });
  } catch (error) {
    // Prefetch is an optimization, not a requirement — fall back to client fetch
    // if the DB hiccups (transient Neon CU disconnect, cache layer outage, etc.).
    console.error('PackerSurfacePage prefetch failed; client will hydrate via /api/packerlogs', error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SurfaceGate surfaceKey="pack">
        <PackerPageContent />
      </SurfaceGate>
    </HydrationBoundary>
  );
}
