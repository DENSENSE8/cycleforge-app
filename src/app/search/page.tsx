/**
 * /search — thin cross-entity results launcher (AI search Phase 3).
 *
 * URL-as-state: `?q=` is the query, `?type=` the category tab (Overview /
 * Units / Receiving / …). Order lookup is **not** hosted here — the header
 * handoff and order rows deep-link to `/o/[id]?mode=search` (master-nav map +
 * full detail). Overview groups every entity with top hits; category tabs
 * re-query with a HARD entityTypes scope. Rows use the shared SearchHit
 * renderer and deep-link to each record's surface.
 *
 * Fallback by construction: an unlinked tenant gets keyword-only hits from
 * the same endpoint; a 403 (no ai.search permission) shows a teaching state.
 */

import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SearchWorkspace } from '@/components/search/SearchWorkspace';

export default function SearchPage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-canvas">
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center">
            <LoadingSpinner size="lg" className="text-blue-600" />
          </div>
        }
      >
        <SearchWorkspace />
      </Suspense>
    </div>
  );
}
