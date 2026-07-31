'use client';

/**
 * `/search` refine chrome — field-density filter icon for SearchBar
 * `trailingPrefix`. Type + Status + Sort over the retrieved top-50; URL-durable.
 */

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
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
    <WorkbenchFilterPopover
      open={open}
      onOpenChange={setOpen}
      hot={hot}
      label="Filters"
      hotActiveLabel={hotLabel}
      density="field"
      contentClassName="w-52"
    >
      <WorkbenchFilterGroupLabel>Type</WorkbenchFilterGroupLabel>
      <WorkbenchFilterMenuRow
        label="All types"
        active={etype === null}
        onClick={() => {
          setEtype(null);
        }}
      />
      {SEARCH_ENTITY_TYPES.map((id) => (
        <WorkbenchFilterMenuRow
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
          <WorkbenchFilterDivider />
          <WorkbenchFilterGroupLabel>Status</WorkbenchFilterGroupLabel>
          <WorkbenchFilterMenuRow
            label="All statuses"
            active={hstat === null}
            onClick={() => {
              setHstat(null);
            }}
          />
          {statusOptions.map((s) => (
            <WorkbenchFilterMenuRow
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

      <WorkbenchFilterDivider />
      <WorkbenchFilterGroupLabel>Sort</WorkbenchFilterGroupLabel>
      {SEARCH_DISPLAY_SORT_OPTIONS.map((opt) => (
        <WorkbenchFilterMenuRow
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
          <WorkbenchFilterDivider />
          <WorkbenchFilterMenuRow
            label="Clear filters"
            active={false}
            onClick={() => {
              clearAll();
              setOpen(false);
            }}
          />
        </>
      ) : null}
    </WorkbenchFilterPopover>
  );
}
