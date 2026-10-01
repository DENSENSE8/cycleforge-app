import { HydrationBoundary } from '@tanstack/react-query';
import { cookies } from 'next/headers';
import { ShippedWorkspace } from '@/components/outbound/workspaces/ShippedWorkspace';
import {
  parseShippedTypeFilter,
  SHIPPED_FILTER_COOKIE,
} from '@/lib/shipping/shipped-feed-config';
import { seedShippedLedger } from '@/lib/queries/shipped-ledger-seed.server';

/** `/fulfilled` — every package that left the building. */
export default async function FulfilledPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const urlFilter = Array.isArray(params.shippedFilter)
    ? params.shippedFilter[0]
    : params.shippedFilter;
  const cookieFilter = (await cookies()).get(SHIPPED_FILTER_COOKIE)?.value;
  const shippedFilter = parseShippedTypeFilter(urlFilter ?? cookieFilter);
  const seed = await seedShippedLedger(shippedFilter);

  return (
    <HydrationBoundary state={seed.state}>
      <ShippedWorkspace initialShippedFilter={seed.shippedFilter} />
    </HydrationBoundary>
  );
}
