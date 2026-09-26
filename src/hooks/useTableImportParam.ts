'use client';

/** `?import=csv` paint-pending — generalized off the To-Ship-only hook. */

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
