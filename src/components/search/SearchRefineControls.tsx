'use client';

/**
 * FIND browse refine — ONE URL contract, TWO forms.
 * deliberately (operator 2026-09-12, who overruled the pill-row refusal for
 * Page modes ride the TOP row (`DeskPageChrome`, operator 2026-08-31) — this
 */

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/design-system/primitives/Button';
import { Toolbar } from '@/design-system/primitives/Toolbar';
import { Badge } from '@/components/ui/badge';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Filter, X } from '@/components/Icons';
import {
  RefineCluster,
  RefinePill,
  RefineTab,
  RefineTrack,
} from '@/components/search/SearchRefinePills';
import { useFindDensity } from '@/components/search/find-density-context';
import {
  SEARCH_DISPLAY_SORT_OPTIONS,
  SEARCH_ENTITY_TYPES,
  SEARCH_ENTITY_TYPE_LABELS,
  SEARCH_SORT_PARAM,
  SEARCH_ETYPE_PARAM,
  SEARCH_HSTAT_PARAM,
  SEARCH_CHAN_PARAM,
  activeSearchRefineCount,
  applySearchDisplaySort,
  applySearchEtype,
  applySearchHstat,
  applySearchChan,
  clearSearchRefine,
  parseSearchDisplaySort,
  parseSearchEtype,
  parseSearchHstat,
  parseSearchChan,
  refineSearchHits,
  type SearchDisplaySort,
  searchEntityCounts,
  statusOptionsFromHits,
  channelOptionsFromHits,
} from '@/lib/search/search-refine';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import type { SearchHitEntityType } from '@/lib/search/search-hit';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { MenuBrandIdentity } from '@/components/ui/grid-cells';
import { cornerClass } from '@/design-system/tokens/radius';
import { fieldLabel } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';

/** The band's tone + geometry, shared so both forms sit on the same plate. */
const REFINE_BAND_CLASS = 'min-h-9 w-full shrink-0 bg-surface-sunken py-1';

export function SearchRefineControls({
  hits,
}: {
  /** The UNFILTERED settled hit set — the toolbar's ONE input. */
  hits: readonly AiSearchHit[];
}) {
  const density = useFindDensity();
  const platformMeta = usePlatformMeta();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);

  const etype = parseSearchEtype(searchParams.get(SEARCH_ETYPE_PARAM));
  const hstat = parseSearchHstat(searchParams.get(SEARCH_HSTAT_PARAM));
  const chan = parseSearchChan(searchParams.get(SEARCH_CHAN_PARAM));
  const sort = parseSearchDisplaySort(searchParams.get(SEARCH_SORT_PARAM));

  const entityCounts = useMemo(
    () => searchEntityCounts(hits, { hstat, chan }),
    [hits, hstat, chan],
  );
  const statusOptions = useMemo(() => statusOptionsFromHits(hits), [hits]);
  /**
   * Each channel pill wears its real brand dot, resolved through the
   * catalog-aware {@link usePlatformMeta} — the one colour source the rest of
   * the product uses, so eBay is the same yellow here as on a carton listing.
   */
  const channelOptions = useMemo(() => channelOptionsFromHits(hits), [hits]);

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

  // NAVIGATION: one plate, one current position. `All` is the default face
  // rather than a twelfth filter you can un-pick.
  const scopeTrack = (
    <RefineTrack label="Result type">
      <RefineTab
        label="All"
        count={entityCounts.total}
        active={etype === null}
        onClick={() => {
          setEtype(null);
        }}
      />
      {SEARCH_ENTITY_TYPES.map((id) => {
        const count = entityCounts.byType[id];
        const active = etype === id;
        return (
          <RefineTab
            key={id}
            label={SEARCH_ENTITY_TYPE_LABELS[id]}
            count={count}
            active={active}
            // An empty scope is a dead end, not a filter — but never lock the
            // operator inside the scope they are already standing in.
            disabled={count === 0 && !active}
            onClick={() => {
              setEtype(active ? null : id);
            }}
          />
        );
      })}
    </RefineTrack>
  );

  const facetCluster =
    statusOptions.length === 0 && channelOptions.length === 0 ? undefined : (
      <RefineCluster label="Status and channel">
        {statusOptions.map((value) => {
          const active = hstat === value;
          return (
            <RefinePill
              key={`hstat:${value}`}
              label={value}
              active={active}
              onClick={() => {
                setHstat(active ? null : value);
              }}
            />
          );
        })}
        {channelOptions.map((value) => {
          const meta = platformMeta(value);
          const active = chan === value;
          return (
            <RefinePill
              key={`chan:${value}`}
              label={meta.label}
              active={active}
              leading={
                <MenuBrandIdentity
                  kind="platform"
                  label={meta.label}
                  value={value}
                  meta={meta}
                />
              }
              onClick={() => {
                setChan(active ? null : value);
              }}
            />
          );
        })}
      </RefineCluster>
    );

  // A CONTROL: the same plate as scope, but LABELLED — an unlabelled `Relevance` `Date` pair at the trailing edge reads as two more filters.
  const sortCluster = (
    <RefineCluster label="Sort and display">
      <RefineTrack label="Result order" labelText="Sort">
        {SEARCH_DISPLAY_SORT_OPTIONS.map((opt) => (
          <RefineTab
            key={opt.id}
            label={opt.label}
            active={sort === opt.id}
            onClick={() => {
              setSort(opt.id);
            }}
          />
        ))}
      </RefineTrack>
      {hot ? (
        <Button
          size="sm"
          radius="pill"
          variant="ghost"
          icon={<X />}
          onClick={clearAll}
        >
          Clear
        </Button>
      ) : null}
    </RefineCluster>
  );

  if (density === 'comfortable') {
    return (
      <Toolbar
        tone="transparent"
        // WRAPS, never clips.
        className={cn(REFINE_BAND_CLASS, 'flex-wrap gap-y-1')}
        start={scopeTrack}
        center={facetCluster}
        end={sortCluster}
      />
    );
  }

  const refineCount = activeSearchRefineCount(searchParams);
  const visibleCount = refineSearchHits(hits, { etype, hstat, chan }).length;
  const scopeLabel = etype ? SEARCH_ENTITY_TYPE_LABELS[etype] : 'All results';
  /**
   * The band's three slots, stacked. Same clusters, same order, same URL
   * writers — the sheet re-labels them and lets them wrap, which is the whole
   * difference between the two forms.
   */
  const sheetSections = [
    { id: 'scope', label: 'Result type', cluster: scopeTrack },
    { id: 'facets', label: 'Status and channel', cluster: facetCluster },
    { id: 'sort', label: 'Order', cluster: sortCluster },
  ];

  return (
    <>
      <Toolbar
        tone="transparent"
        className={cn(REFINE_BAND_CLASS, 'h-auto px-3')}
        start={
          <Button
            size="sm"
            radius="pill"
            // Live refines make this the band's one hot control; idle it is a
            // bubble on the sunken plate, the same face a filter wears.
            variant={hot ? 'primary' : 'secondary'}
            icon={<Filter />}
            aria-expanded={sheetOpen}
            data-testid="search-refine-trigger"
            onClick={() => {
              setSheetOpen(true);
            }}
          >
            <span className="truncate">{scopeLabel}</span>
            {/* The badge appears only when something is on, so the NUMBER — not
                the fill colour — is what says "you are filtered". */}
            {refineCount > 0 ? (
              <Badge
                variant="secondary"
                className={cn(cornerClass('pill'), 'tabular-nums')}
              >
                {refineCount}
              </Badge>
            ) : null}
          </Button>
        }
        end={
          // The row tally the phone mount has no foot strip to print. Text,
          // not a control: the trailing edge stays at zero icons.
          <span className="shrink-0 tabular-nums text-role-caption text-text-muted">
            {visibleCount === hits.length
              ? `${visibleCount} results`
              : `${visibleCount} of ${hits.length}`}
          </span>
        }
      />

      <BottomSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
        }}
        title="Refine results"
        scrollBody
      >
        {/* Each cluster keeps the BAND's tone relationship: */}
        <div className="flex flex-col gap-3">
          {sheetSections.map(({ id, label, cluster }) =>
            cluster ? (
              <section
                key={id}
                className={cn('flex flex-col gap-1.5 bg-surface-sunken inset-field', cornerClass('field'))}
              >
                <span className={fieldLabel}>{label}</span>
                {cluster}
              </section>
            ) : null,
          )}
        </div>
      </BottomSheet>
    </>
  );
}
