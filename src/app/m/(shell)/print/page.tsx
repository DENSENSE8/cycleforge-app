'use client';

/**
 * /m/print — one-step mobile bulk print + staff silent-USB bridge.
 *
 * Callers: MobileSidebarDrawer nav. No DB schema.
 * User: configure bulk labels and papers in the mobile app, one column.
 */

import { Suspense } from 'react';
import { MobilePrintWorkspace } from '@/components/mobile/print/MobilePrintWorkspace';

export default function MobilePrintPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-role-caption font-semibold text-text-soft">
          Loading print…
        </div>
      }
    >
      <MobilePrintWorkspace />
    </Suspense>
  );
}
