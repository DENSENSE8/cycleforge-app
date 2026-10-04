'use client';

import { Suspense } from 'react';
import { CustomersDesk } from '@/components/customers/CustomersDesk';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RouteShell } from '@/design-system/components/RouteShell';

function CustomersPageContent() {
  return (
    <div className="hidden h-full w-full overflow-hidden bg-surface-card md:flex">
      <RouteShell
        actions={null}
        history={(
          <DeskPageLayout bare className="h-full">
            <CustomersDesk />
          </DeskPageLayout>
        )}
      />
    </div>
  );
}

/** `/customers` — the desktop face of the V2 mobile customer book. */
export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="flex h-full w-full items-center justify-center bg-surface-card"><LoadingSpinner size="lg" /></div>}>
      <CustomersPageContent />
    </Suspense>
  );
}
