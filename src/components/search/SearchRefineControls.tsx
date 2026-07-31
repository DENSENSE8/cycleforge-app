'use client';

/**
 * `/search` refine chrome — FilterRefinementBar (etype + hstat) + QueueSortSwitch
 * (relevance | date). Client-only over the retrieved top-50; URL-durable.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { QueueSortSwitch } from '@/components/dashboard/QueueSortSwitch';
import { FilterDropdownSelect } from '@/design-system/components/FilterDropdownSelect';
import {
  FilterRefinementBar,
  type FilterRefinement,
} from '@/design-system/components/FilterRefinementBar';
import { Button } from '@/design-system/primitives';
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
  className,
}: {
  /** Distinct `facets.status` values from the current (unfiltered) hit set. */
  statusOptions: readonly string[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const entityOptions = useMemo(
    () =>
      SEARCH_ENTITY_TYPES.map((id) => ({
        value: id,
        label: SEARCH_ENTITY_TYPE_LABELS[id],
      })),
    [],
  );

  const statusSelectOptions = useMemo(
    () => statusOptions.map((s) => ({ value: s, label: s })),
    [statusOptions],
  );

  const refinements = useMemo((): FilterRefinement[] => {
    const out: FilterRefinement[] = [];
    if (etype) {
      out.push({
        id: 'etype',
        label: SEARCH_ENTITY_TYPE_LABELS[etype],
        onRemove: () => setEtype(null),
      });
    }
    if (hstat) {
      out.push({
        id: 'hstat',
        label: hstat,
        onRemove: () => setHstat(null),
      });
    }
    return out;
  }, [etype, hstat, setEtype, setHstat]);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-start gap-3">
        <FilterRefinementBar
          label="Refine"
          className="min-w-0 flex-1"
          refinements={refinements}
          onClearAll={refinements.length > 0 ? clearAll : undefined}
          renderDropdown={(onClose) => (
            <div className="space-y-3">
              <FilterDropdownSelect
                label="Type"
                value={etype}
                onChange={(next) => setEtype(parseSearchEtype(next))}
                emptyOption={{ value: '', label: 'All types' }}
                options={entityOptions}
              />
              <FilterDropdownSelect
                label="Status"
                value={hstat}
                onChange={(next) => setHstat(next || null)}
                emptyOption={{ value: '', label: 'All statuses' }}
                options={statusSelectOptions}
              />
              <Button variant="brand" size="md" onClick={onClose} className="w-full">
                Done
              </Button>
            </div>
          )}
        />
        <QueueSortSwitch
          sort={sort}
          onChange={setSort}
          options={SEARCH_DISPLAY_SORT_OPTIONS}
          ariaLabel="Sort search results"
          className="mt-0.5"
        />
      </div>
    </div>
  );
}
