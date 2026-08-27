import { Suspense } from 'react';
import { requirePermission } from '@/lib/auth/page-guard';
import { CatalogWorkspace } from '@/components/studio/CatalogWorkspace';

/**
 * /studio/catalog — the unified template catalog (Template Platform Phase 4).
 * Two modes on one page via a mode rail:
 *   - Browse (default) — any studio.view user browses the curated COMMUNITY
 *     catalog and clones a blueprint into their own Studio as a draft.
 *   - Review — a platform curator (studio.catalog.review) moderates org-submitted
 *     templates: approve → public/approved (enters the curated catalog), or
 *     reject → private.
 *
 * The page guard is relaxed to studio.view (everyone browses); studio.catalog.review
 * only gates whether the Review tab is offered. The underlying routes stay
 * server-gated independently: the review APIs (/api/studio/catalog/submissions +
 * .../[id]/review) are studio.catalog.review; the clone route
 * (/api/studio/templates/[id]/import) is studio.manage.
 *
 * Workbench archetype (list → select → detail → act). Client child reads
 * useSearchParams (mode + selection), so it renders inside <Suspense>.
 */
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
