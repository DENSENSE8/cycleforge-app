import { HydrationBoundary } from '@tanstack/react-query';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { SurfaceParamHygiene } from '@/components/routing/SurfaceParamHygiene';
import { StationLiveFeed } from '@/components/stations/live/StationLiveFeed';
import { requirePermission } from '@/lib/auth/page-guard';
import { readStationLiveFilters } from '@/lib/queries/station-live-feed';
import { seedStationLiveFeed } from '@/lib/queries/station-live-feed-seed.server';

export const dynamic = 'force-dynamic';

function toSearchParams(values: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
    else if (value != null) params.set(key, value);
  }
  return params;
}

export default async function StationLivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('operations.view');
  const filters = readStationLiveFilters(toSearchParams(await searchParams));
  const state = await seedStationLiveFeed(user.organizationId, user.staffId, filters);
  return (
    <>
      <SurfaceParamHygiene />
      <HydrationBoundary state={state}>
        <DeskPageLayout bare className="h-full min-h-0">
          <StationLiveFeed filters={filters} />
        </DeskPageLayout>
      </HydrationBoundary>
    </>
  );
}
