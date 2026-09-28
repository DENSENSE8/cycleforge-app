import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { MobileImportRun } from '@/components/mobile/imports/MobileImportRun';

export const dynamic = 'force-dynamic';

/** `/m/imports/[runId]` — one import run's record: a full screen with an X back to the list. */
export default async function MobileImportRunPage() {
  await requirePermission('orders.view');
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <MobileImportRun />
    </Suspense>
  );
}
