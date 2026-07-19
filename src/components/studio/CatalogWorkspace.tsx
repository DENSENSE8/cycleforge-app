'use client';

/**
 * CatalogWorkspace — the unified /studio/catalog shell (Template Platform Phase 4).
 * One page, two modes on a sidebar-style mode rail:
 *   - Browse (default, studio.view) — the community catalog browse/clone surface
 *     (<CommunityCatalogWorkbench/>).
 *   - Review (studio.catalog.review only) — the curator submission queue
 *     (<CatalogReviewWorkbench/>), rendered unchanged.
 *
 * Mode is URL state (?mode=, default 'browse' drops from the URL). Switching mode
 * clears the mode-scoped ?selectedId so a selection from one mode never bleeds
 * into the other. Client-side gating is a UX affordance only: the Review tab is
 * hidden for non-curators and a forced ?mode=review falls back to browse — the
 * real enforcement is server-side (the review APIs are studio.catalog.review, the
 * clone route is studio.manage).
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { HorizontalButtonSlider, type HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { ClipboardList, Globe } from '@/components/Icons';
import { CatalogReviewWorkbench } from '@/components/studio/CatalogReviewWorkbench';
import { CommunityCatalogWorkbench } from '@/components/studio/CommunityCatalogWorkbench';
import { appCanvasClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

type CatalogMode = 'browse' | 'review';

const MODE_ITEMS: Array<HorizontalSliderItem & { id: CatalogMode }> = [
  { id: 'browse', label: 'Browse', icon: Globe },
  { id: 'review', label: 'Review', icon: ClipboardList },
];

export function CatalogWorkspace({ canReview }: { canReview: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // A non-curator forcing ?mode=review falls back to browse.
  const mode: CatalogMode = useMemo(() => {
    const raw = searchParams.get('mode');
    return raw === 'review' && canReview ? 'review' : 'browse';
  }, [searchParams, canReview]);

  const items = useMemo(
    () => (canReview ? MODE_ITEMS : MODE_ITEMS.filter((m) => m.id !== 'review')),
    [canReview],
  );

  const handleModeChange = useCallback(
    (id: string) => {
      const next = id as CatalogMode;
      const params = new URLSearchParams(searchParams.toString());
      // Default mode drops from the URL; switching modes clears the scoped selection.
      if (next === 'browse') params.delete('mode');
      else params.set('mode', next);
      params.delete('selectedId');
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div className={cn('flex h-full min-h-0 flex-1 flex-col', appCanvasClass)}>
      {items.length > 1 && (
        <div className="border-b border-border-hairline px-3 pt-1 pb-2">
          <HorizontalButtonSlider
            items={items}
            value={mode}
            onChange={handleModeChange}
            variant="nav"
            dense
            aria-label="Catalog mode"
          />
        </div>
      )}

      <div className="min-h-0 flex-1">
        {mode === 'review' && canReview ? <CatalogReviewWorkbench /> : <CommunityCatalogWorkbench />}
      </div>
    </div>
  );
}
