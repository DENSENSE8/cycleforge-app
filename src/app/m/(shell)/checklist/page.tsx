'use client';

import { Suspense } from 'react';
import { MobileChecklistPage } from '@/components/mobile/checklist/MobileChecklistPage';

/**
 * /m/checklist — Mobile packing checklist CRUD keyed by item number.
 * Resolve item # → sku_catalog → edit kit parts + QC templates.
 */
export default function MobileChecklistRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-role-caption font-semibold text-text-soft">
          Loading…
        </div>
      }
    >
      <MobileChecklistPage />
    </Suspense>
  );
}
