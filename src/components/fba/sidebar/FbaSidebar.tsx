'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { FbaWorkspaceSidebar, FbaWorkspaceSidebarFallback } from '@/components/fba/sidebar/FbaWorkspaceSidebar';
import { FbaCatalogSidebarFallback } from '@/components/fba/sidebar/FbaCatalogSidebar';
import { FbaCatalogSidebarPanel } from '@/components/admin/FbaCatalogSidebarPanel';
import { FBA_MODE_PARAM } from '@/lib/fba/fba-modes';

/**
 * The FBA desk rail. `?fbaMode=catalog` is the ex-Admin › Amazon Prep FNSKU
 * catalog (admin dissolution), and it takes the catalog PICKER — the rail the
 * console mounted for that section, and the only writer of `?search=` /
 * `?fnsku=` / `?fbaFilter=`, which the catalog pane reads. Every other mode is
 * the workspace rail (mode pills, scan bar, rails, shipped).
 */
export function FbaSidebarPanel() {
  const searchParams = useSearchParams();
  if (searchParams.get(FBA_MODE_PARAM) === 'catalog') {
    return (
      <Suspense fallback={<FbaCatalogSidebarFallback />}>
        <FbaCatalogSidebarPanel />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<FbaWorkspaceSidebarFallback />}>
      <FbaWorkspaceSidebar />
    </Suspense>
  );
}

// `AdminFbaSidebarPanel` DELETED with the admin console: it wrapped the thin
// catalog tools rail, and the catalog face takes the picker above.
