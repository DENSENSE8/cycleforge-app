'use client';

/**
 * `?import=csv` paint-pending — generalized off the To-Ship-only hook.
 *
 * The Import control and the desk that swaps its middle are separate React
 * trees, so they share one pending channel (keyed per family, so two staging
 * surfaces can never paint each other).
 *
 * Without this the surface could not open at all: the store publishes the draft
 * SYNCHRONOUSLY, so the desk re-rendered with a draft while `useSearchParams`
 * still said `import` was absent — and its "leaving staging via URL should drop
 * the draft" effect fired on that frame and threw the draft away before the
 * soft-replace landed. House law: a mount-gated URL open paints through
 * `useOptimisticUrlParam`, never a feature-local pending twin waiting on
 * soft-replace (`source-of-truth.md` → Optimistic URL-param paint).
 *
 * The URL VALUE is the same on every desk (`csv`) — the ROUTE says which
 * surface, and `descriptor.deskPath` is where the soft-replace lands.
 */

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import {
  TABLE_IMPORT_URL_PARAM,
  TABLE_IMPORT_URL_VALUE,
} from '@/lib/tables/import/staging-store';
import type { TableImportDescriptor } from '@/lib/tables/import/types';
import {
  GRID_COLUMN_DIR_PARAM,
  GRID_COLUMN_SORT_PARAM,
} from '@/lib/tables/grid-column-sort-params';

export function useTableImportParam<TField extends string, TRowView>(
  descriptor: TableImportDescriptor<TField, TRowView>,
): {
  /** True while the staging surface owns the desk (pending-aware). */
  active: boolean;
  /** Enter (`true`) / leave (`false`) staging — paints, then soft-replaces. */
  setActive: (next: boolean) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { deskPath, surfaceId } = descriptor;

  const urlActive = searchParams.get(TABLE_IMPORT_URL_PARAM) === TABLE_IMPORT_URL_VALUE;

  const replace = useCallback(
    (mutateParams: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutateParams(params);
      const qs = params.toString();
      router.replace(qs ? `${deskPath}?${qs}` : deskPath, { scroll: false });
    },
    [deskPath, router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: boolean) => {
    if (next) {
      params.set(TABLE_IMPORT_URL_PARAM, TABLE_IMPORT_URL_VALUE);
      // Staging owns the right rail — drop competing ingest/new-order occupants
      // in the same replace so the two paint-pending writes cannot race.
      params.delete('ingest');
      params.delete('new');
      return;
    }
    params.delete(TABLE_IMPORT_URL_PARAM);
    // The draft dies with the surface — a staging column sort that outlived it
    // would sort the live queue by a key it does not have.
    params.delete(GRID_COLUMN_SORT_PARAM);
    params.delete(GRID_COLUMN_DIR_PARAM);
  }, []);

  const { value, setValue } = useOptimisticUrlParam<boolean>({
    urlValue: urlActive,
    replace,
    write,
    // One pending per FAMILY — the popover writes it, the desk paints from it.
    shareKey: `table-import:${surfaceId}`,
  });

  return { active: value, setActive: setValue };
}
