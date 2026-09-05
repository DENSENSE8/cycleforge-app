'use client';

/**
 * `/search` browse refine strip — Type + Status + Sort over the retrieved
 * top-50, URL-durable.
 *
 * Its seat is the strip `SearchBrowseShell` paints above the results list
 * (`px-3 py-1.5`, right-aligned), NOT a `trailingSuffix` slot on the find
 * field — the docblock claimed a seat this component has never had, and
 * the in-field trigger was sized for it. The rail trigger is what matches the
 * strip's row height.
 *
 * **`SEARCH_SORT_PARAM` is deliberately `GRID_COLUMN_SORT_PARAM` (`?colsort=`)
 * with no `?coldir=` companion.** This is a two-option display sort
 * (relevance | date), not a spreadsheet column sort, so there is no direction
 * to carry — do not "fix" it by routing it through `useUrlColumnSort`, which
 * would start writing a `coldir` key nothing here reads.
 */

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  FilterMenuDivider,
  FilterMenuGroupLabel,
  FilterMenuRow,
  FilterMenu,
} from '@/components/ui/FilterMenu';
import {
  SEARCH_DISPLAY_SORT_OPTIONS,
  SEARCH_ENTITY_TYPES,
  SEARCH_ENTITY_TYPE_LABELS,
  SEARCH_SORT_PARAM,
  SEARCH_ETYPE_PARAM,
  SEARCH_LEGACY_ETYPE_PARAM,
  SEARCH_HSTAT_PARAM,
  SEARCH_CHAN_PARAM,
  applySearchDisplaySort,
  applySearchEtype,
  applySearchHstat,
  applySearchChan,
  clearSearchRefine,
  parseSearchDisplaySort,
  parseSearchEtype,
  parseSearchHstat,
  parseSearchChan,
  type SearchDisplaySort,
} from '@/lib/search/search-refine';
import type { SearchHitEntityType } from '@/lib/search/search-hit';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { MenuBrandIdentity } from '@/components/ui/grid-cells';

export function SearchRefineControls({
  statusOptions,
  channelOptions = [],
}: {
  /** Distinct `facets.status` values from the current (unfiltered) hit set. */
  statusOptions: readonly string[];
  /**
   * Distinct `facets.source_platform` values from the same set. Rendered with
   * each channel's real brand dot, resolved through the catalog-aware
   * {@link usePlatformMeta} — the one colour source the rest of the product
   * uses, so eBay is the same yellow here as on a carton listing.
   */
  channelOptions?: readonly string[];
}) {
  const platformMeta = usePlatformMeta();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const etype = parseSearchEtype(
    searchParams.get(SEARCH_ETYPE_PARAM) ?? searchParams.get(SEARCH_LEGACY_ETYPE_PARAM),
  );
  const hstat = parseSearchHstat(searchParams.get(SEARCH_HSTAT_PARAM));
  const chan = parseSearchChan(searchParams.get(SEARCH_CHAN_PARAM));
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

  const setChan = useCallback(
    (next: string | null) => {
      replaceParams((p) => applySearchChan(p, next));
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

  const hot = Boolean(etype || hstat || chan);
  const hotLabel = useMemo(() => {
    const parts: string[] = [];
    if (etype) parts.push(SEARCH_ENTITY_TYPE_LABELS[etype]);
    if (hstat) parts.push(hstat);
    if (chan) parts.push(platformMeta(chan).label);
    return parts.length > 0 ? parts.join(' · ') : undefined;
  }, [etype, hstat, chan, platformMeta]);

  return (
    <FilterMenu
      open={open}
      onOpenChange={setOpen}
      hot={hot}
      label="Filters"
      hotActiveLabel={hotLabel}
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

      {channelOptions.length > 0 ? (
        <>
          <FilterMenuDivider />
          <FilterMenuGroupLabel>Channel</FilterMenuGroupLabel>
          <FilterMenuRow
            label="All channels"
            active={chan === null}
            onClick={() => {
              setChan(null);
            }}
          />
          {channelOptions.map((value) => {
            const meta = platformMeta(value);
            return (
              <FilterMenuRow
                key={value}
                label={meta.label}
                active={chan === value}
                leading={
                  <MenuBrandIdentity
                    kind="platform"
                    label={meta.label}
                    value={value}
                    meta={meta}
                  />
                }
                onClick={() => {
                  setChan(value);
                }}
              />
            );
          })}
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
