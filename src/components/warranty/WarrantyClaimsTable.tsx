'use client';

import { useSearchParams } from 'next/navigation';
import { useWarrantyClaims, useWarrantyUrlState } from '@/hooks/useWarrantyClaims';
import { WarrantyGridView } from '@/components/warranty/grid/WarrantyGridView';

/**
 * Right-pane warranty claims map — the thin data host over the Workbench
 * spreadsheet SoT ({@link WarrantyGridView} → `LedgerGridSurface`).
 *
 * Search / status / expiring filters all live in the sidebar (URL params); this
 * reads the SAME params so both share one React Query cache key. The hand-rolled
 * `<table>` this replaced carried its own sticky header, its own selection ring
 * (`ring-1 ring-inset ring-blue-400`, the list recipe under what is now an
 * airtable skin), and no column config or durable sort at all.
 */
export function WarrantyClaimsTable() {
  const searchParams = useSearchParams();
  const search = String(searchParams.get('search') || '').trim();
  const { status, expiringSoon, openClaimId, openClaim } = useWarrantyUrlState();

  const { data: claims = [], isLoading, error } = useWarrantyClaims({ status, search, expiringSoon });

  // Degrade-not-fail: the claim list is this pane's PRIMARY resource, so a
  // failed fetch earns the retryable error state rather than an empty grid that
  // would read as "no claims" — the exact lie the four settled states exist to
  // prevent (`display/workbench.md`).
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-surface-canvas p-8">
        <div className="rounded-none border border-dashed border-border-danger bg-surface-danger px-4 py-6 text-center">
          <p className="text-sm font-semibold text-text-danger">
            {error instanceof Error ? error.message : 'Could not load warranty claims.'}
          </p>
        </div>
      </div>
    );
  }

  // A filter is narrowing the list when any of the three refinements is on —
  // that is what picks "no matches" over "nothing logged yet".
  const isSearching = Boolean(search) || status != null || expiringSoon;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-canvas">
      <WarrantyGridView
        rows={claims}
        loading={isLoading}
        openClaimId={openClaimId}
        onOpenClaim={(id) => openClaim(id === openClaimId ? null : id)}
        emptyMessage="No warranty claims logged yet."
        searchEmptyMessage="No warranty claims match these filters."
        isSearching={isSearching}
      />
    </div>
  );
}
