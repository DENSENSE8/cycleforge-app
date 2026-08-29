'use client';

/**
 * `/search` browse refine strip — Type + Status + Sort over the retrieved
 * top-50, URL-durable.
 *
 * Its seat is the strip `SearchBrowseShell` paints above the results list
 * (`px-3 py-1.5`, right-aligned), NOT a `trailingSuffix` slot on the find
 * field — the docblock claimed a seat this component has never had, and
 * `density="field"` was sized for it. `toolbar` is the density that matches the
 * strip's row height.
 *
 * **`SEARCH_SORT_PARAM` is deliberately `GRID_COLUMN_SORT_PARAM` (`?colsort=`)
 * with no `?coldir=` companion.** This is a two-option display sort
 * (relevance | date), not a spreadsheet column sort, so there is no direction
 * to carry — do not "fix" it by routing it through `useUrlColumnSort`, which
 * would start writing a `coldir` key nothing here reads.
 */

import {
  FilterMenu,
  FilterMenuDivider,
  FilterMenuGroupLabel,
  FilterMenuRow,
} from '@/design-system/primitives/FilterMenu';
import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  SEARCH_DISPLAY_SORT_OPTIONS,
  SEARCH_ENTITY_TYPES,
  SEARCH_ENTITY_TYPE_LABELS,
  SEARCH_SORT_PARAM,
  SEARCH_ETYPE_PARAM,
  SEARCH_HSTAT_PARAM,
  applySearchDisplaySort,
  applySearchEtype,
  applySearchHstat,
  clearSearchRefine,
  parseSearchDisplaySort,
  parseSearchEtype,
  parseSearchHstat,
  type SearchDisplaySort,
} from '@/lib/search/search-refine';
import type { SearchHitEntityType } from '@/lib/search/search-hit';

export function SearchRefineControls({
  statusOptions,
}: {
  /** Distinct `facets.status` values from the current (unfiltered) hit set. */
  statusOptions: readonly string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const etype = parseSearchEtype(searchParams.get(SEARCH_ETYPE_PARAM));
  const hstat = parseSearchHstat(searchParams.get(SEARCH_HSTAT_PARAM));
  const sort = parseSearchDisplaySort(searchParams.get(SEARCH_SORT_PARAM));

  const replaceParams = useCallback(
    (mutator: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutator(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname || '/search', { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setEtype = useCallback(
    (next: SearchHitEntityType | null) => {
      replaceParams((p) => applySearchEtype(p, next));
    },
    [replaceParams],
  );

  const setHstat = useCallback(
    (next: string | null) => {
      replaceParams((p) => applySearchHstat(p, next));
    },
    [replaceParams],
  );

  const setSort = useCallback(
    (next: SearchDisplaySort) => {
      replaceParams((p) => applySearchDisplaySort(p, next));
    },
    [replaceParams],
  );

  const clearAll = useCallback(() => {
    replaceParams(clearSearchRefine);
  }, [replaceParams]);

  const hot = Boolean(etype || hstat);
  const hotLabel = useMemo(() => {
    const parts: string[] = [];
    if (etype) parts.push(SEARCH_ENTITY_TYPE_LABELS[etype]);
    if (hstat) parts.push(hstat);
    return parts.length > 0 ? parts.join(' · ') : undefined;
  }, [etype, hstat]);

  return (
    <FilterMenu
      open={open}
      onOpenChange={setOpen}
      hot={hot}
      label="Filters"
      density="toolbar"
      contentClassName="w-52"
    >
      <FilterMenuGroupLabel>Type</FilterMenuGroupLabel>
      <FilterMenuRow
        label="All types"
        active={etype === null}
        onClick={() => {
          setEtype(null);
        }}
      />
      {SEARCH_ENTITY_TYPES.map((id) => (
        <FilterMenuRow
          key={id}
          label={SEARCH_ENTITY_TYPE_LABELS[id]}
          active={etype === id}
          onClick={() => {
            setEtype(id);
          }}
        />
      ))}

      {statusOptions.length > 0 ? (
        <>
          <FilterMenuDivider />
          <FilterMenuGroupLabel>Status</FilterMenuGroupLabel>
          <FilterMenuRow
            label="All statuses"
            active={hstat === null}
            onClick={() => {
              setHstat(null);
            }}
          />
          {statusOptions.map((s) => (
            <FilterMenuRow
              key={s}
              label={s}
              active={hstat === s}
              onClick={() => {
                setHstat(s);
              }}
            />
          ))}
        </>
      ) : null}

      <FilterMenuDivider />
      <FilterMenuGroupLabel>Sort</FilterMenuGroupLabel>
      {SEARCH_DISPLAY_SORT_OPTIONS.map((opt) => (
        <FilterMenuRow
          key={opt.id}
          label={opt.label}
          active={sort === opt.id}
          onClick={() => {
            setSort(opt.id);
          }}
        />
      ))}

      {hot ? (
        <>
          <FilterMenuDivider />
          <FilterMenuRow
            label="Clear filters"
            active={false}
            onClick={() => {
              clearAll();
              setOpen(false);
            }}
          />
        </>
      ) : null}
    </FilterMenu>
  );
}
