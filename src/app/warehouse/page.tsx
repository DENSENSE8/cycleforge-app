import { redirect } from 'next/navigation';

/**
 * Legacy `/warehouse` desk — permanently redirected to `/inventory/locations`.
 * The orphan child `/warehouse/replenishment` keeps its own route.
 */
export default function WarehousePage() {
  redirect('/inventory/locations');
}
