import { Suspense } from 'react';
import { PickPageContent } from '@/components/pick/PickPageContent';
import { requirePermission } from '@/lib/auth/page-guard';

/** Picker desk page shell (`/pick`) — scan band + shipping workspace. The phone twin is `/m/pick`. */
export async function PickSurfacePage() {
  const user = await requirePermission('picking.view');

  return (
    <Suspense fallback={null}>
      <PickPageContent pickerId={String(user.staffId)} />
    </Suspense>
  );
}
