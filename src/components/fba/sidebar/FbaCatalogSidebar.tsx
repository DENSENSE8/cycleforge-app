'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, X } from '@/components/Icons';
import { SearchBar } from '@/components/ui/SearchBar';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { emitOpenAddFba, emitOpenUploadFba, sidebarSubBandClass } from '@/components/fba/sidebar/fba-sidebar-shared';
import { SkeletonBase } from '@/design-system/components/Skeletons';
import { Button } from '@/design-system/primitives';
import { FBA_MODE_PARAM, FBA_OUTBOUND_PATH } from '@/lib/fba/fba-modes';

/** Suspense fallback for the admin FNSKU catalog sidebar. */
export function FbaCatalogSidebarFallback() {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface-card">
      <div className={`${sidebarSubBandClass} ${SIDEBAR_GUTTER} py-2.5`}>
        <SkeletonBase width="6rem" height="1rem" className="mb-2 bg-surface-sunken" />
        <SkeletonBase height="2.5rem" className="bg-surface-sunken" />
      </div>
      <div className={`min-h-0 flex-1 space-y-4 ${SIDEBAR_GUTTER} py-3`}>
        <SkeletonBase width="8rem" height="1rem" className="bg-surface-sunken" />
        <div className="space-y-2">
          <SkeletonBase height="3.5rem" className="bg-surface-canvas" />
          <SkeletonBase height="3.5rem" className="bg-surface-canvas" />
          <SkeletonBase height="3.5rem" className="bg-surface-canvas" />
        </div>
      </div>
    </div>
  );
}

/**
 * FNSKU catalog tools (`/shipping/fba?fbaMode=catalog`, ex-Admin › Amazon Prep
 * before the admin dissolution): catalog search plus the add-row /
 * upload-CSV / clear-search actions and a link to the FBA station.
 */
function FbaCatalogSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchValue = searchParams.get('search') || '';

  const pushCatalogParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete('section');
      next.set(FBA_MODE_PARAM, 'catalog');
      mutate(next);
      const q = next.toString();
      router.replace(q ? `${FBA_OUTBOUND_PATH}?${q}` : FBA_OUTBOUND_PATH);
    },
    [router, searchParams],
  );

  const updateSearch = (value: string) => {
    pushCatalogParams((p) => {
      if (value.trim()) p.set('search', value.trim());
      else p.delete('search');
    });
  };

  const clearFilters = () => {
    pushCatalogParams((p) => {
      p.delete('search');
    });
  };

  const actionRowClass =
    'flex h-auto w-full items-center justify-between gap-2 border border-border-soft bg-surface-canvas px-3 py-2.5 text-left hover:bg-surface-sunken';

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface-card">
      <div className={`${sidebarSubBandClass} ${SIDEBAR_GUTTER} py-2.5`}>
        <p className="mb-2 text-role-micro font-semibold uppercase tracking-widest text-text-soft">
          Catalog search
        </p>
        <SearchBar
          value={searchValue}
          onChange={updateSearch}
          onClear={() => updateSearch('')}
          placeholder="Search ASIN, SKU, or FNSKU"
          variant="blue"
          className="w-full"
        />
      </div>

      <div className={`min-h-0 flex-1 space-y-2 overflow-y-auto ${SIDEBAR_GUTTER} py-3`}>
        <p className="text-role-micro font-semibold uppercase tracking-widest text-text-soft">Catalog actions</p>

        <Button variant="secondary" radius="flush" onClick={emitOpenAddFba} className={actionRowClass}>
          <span>
            <span className="block text-xs font-semibold text-text-default">Add Catalog Row</span>
            <span className="mt-0.5 block text-role-caption text-text-soft">Create one FNSKU mapping manually</span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border-soft bg-surface-card text-text-muted">
            <Plus className="h-4 w-4" />
          </span>
        </Button>

        <Button variant="secondary" radius="flush" onClick={emitOpenUploadFba} className={actionRowClass}>
          <span>
            <span className="block text-xs font-semibold text-text-default">Upload CSV</span>
            <span className="mt-0.5 block text-role-caption text-text-soft">Import many FNSKU mappings from a file</span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border-soft bg-surface-card text-text-muted">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 16V4m0 0-4 4m4-4 4 4M4 16v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"
              />
            </svg>
          </span>
        </Button>

        <Button variant="secondary" radius="flush" onClick={clearFilters} className={actionRowClass}>
          <span>
            <span className="block text-xs font-semibold text-text-default">Clear search</span>
            <span className="mt-0.5 block text-role-caption text-text-soft">Reset the current catalog search</span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border-soft bg-surface-card text-text-muted">
            <X className="h-4 w-4" />
          </span>
        </Button>
      </div>

      <div className={`${sidebarSubBandClass} mt-auto ${SIDEBAR_GUTTER} py-3`}>
        <p className="text-role-micro font-semibold uppercase tracking-widest text-text-soft">FBA Station</p>
        <Link
          href="/fba"
          className="mt-2 flex w-full items-center justify-center rounded-none border border-border-accent bg-surface-accent px-3 py-2 text-xs font-semibold text-text-accent transition-colors hover:bg-surface-hover"
        >
          Open FBA Station
        </Link>
      </div>
    </div>
  );
}
