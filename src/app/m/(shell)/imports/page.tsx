import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { MobileImports } from '@/components/mobile/imports/MobileImports';

export const dynamic = 'force-dynamic';

/** `/m/imports` — the import record on the phone (Runs · Orders), read-only. Desk twin: `/operations/imports`. */
export default async function MobileImportsPage() {
  await requirePermission('orders.view');
  return (
    <Suspense fallback={null}>
      <MobileImports />
    </Suspense>
  );
}
