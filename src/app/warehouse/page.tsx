import { redirect } from 'next/navigation';
import { warehouseRedirectTarget } from '@/lib/inventory/legacy-location-routes';

/**
 * Legacy `/warehouse` desk — permanently redirected to `/inventory/locations`.
 * The orphan child `/warehouse/replenishment` keeps its own route.
 */
export default async function WarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; new?: string; edit?: string; code?: string }>;
}) {
  redirect(warehouseRedirectTarget(await searchParams));
}
