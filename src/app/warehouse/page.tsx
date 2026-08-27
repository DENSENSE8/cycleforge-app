import { redirect } from 'next/navigation';

/**
 * Legacy `/warehouse` desk — permanently redirected to `/inventory/locations`.
 * Orphan children (`/warehouse/rma`, `/warehouse/replenishment`) keep their own routes.
 */
export default function WarehousePage() {
  redirect('/inventory/locations');
}
