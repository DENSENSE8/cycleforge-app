import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { CatalogWorkspace } from '@/components/studio/CatalogWorkspace';

/** /studio/catalog — the unified template catalog (Template Platform Phase 4). */
export const metadata = { title: 'Template catalog' };

export default async function StudioCatalogPage() {
  const user = await requirePermission('studio.view');
  const canReview = user.permissions.has('studio.catalog.review');
  return (
    <Suspense>
      <CatalogWorkspace canReview={canReview} />
    </Suspense>
  );
}
