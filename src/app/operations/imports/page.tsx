import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { ImportsDesk } from '@/components/imports/ImportsDesk';

export const metadata: Metadata = {
  title: 'Imports',
};

export const dynamic = 'force-dynamic';

/** `/operations/imports` — Operations › **Imports**: the per-org import record (runs → steps → orders). */
export default async function OperationsImportsPage() {
  await requirePermission('orders.view');
  return (
    <Suspense fallback={null}>
      <ImportsDesk />
    </Suspense>
  );
}
