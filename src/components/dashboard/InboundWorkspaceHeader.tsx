'use client';

/**
 * Inbound workspace chrome — the one unified header bar for Dashboard · Inbound
 * (receiving cartons). The sibling of {@link OutboundWorkspaceHeader}: same
 * `WorkbenchChromeHeader` primitive, different domain — carton lifecycle facets,
 * never outbound orders.
 *
 * Left:  lifecycle facet tabs (Unboxed · Scanned) — the ids ARE the History
 *        `?sort=` values, so the tab, the day-band axis, and the server ORDER BY
 *        can never disagree (SoT: `HISTORY_SORT_OPTIONS` via `dashboard-domains`).
 * Right: [⫶ carton source / search field] | table controls portal.
 *
 * The search box + refinements were relocated here from the sidebar's
 * `ReceivingHistorySearchSection`; the `rh_q` / `rh_field` / `rh_scope` param
 * contract (`receiving-history-search.ts`) is unchanged, so deep links and the
 * table's query keys keep working untouched.
 */

import { useCallback, useEffect, useMemo, useState, type Ref } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useIsFetching } from '@tanstack/react-query';
import { AlertTriangle, Layout } from '@/components/Icons';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { SearchField } from '@/design-system/primitives/SearchField';
import { useDebounce } from '@/hooks';
import {
  DASHBOARD_INBOUND_DEFAULT_FACET,
  DASHBOARD_INBOUND_FACETS,
  normalizeDashboardInboundFacet,
} from '@/lib/dashboard/dashboard-domains';
import {
  RECEIVING_HISTORY_SEARCH_FIELDS,
  RECEIVING_HISTORY_URL_PARAMS,
  getReceivingHistoryPlaceholder,
  normalizeReceivingHistorySearchField,
  normalizeReceivingHistorySearchScope,
  setReceivingHistoryUrlParams,
  type ReceivingHistorySearchScope,
} from '@/lib/receiving-history-search';

const SCOPE_ITEMS: { id: ReceivingHistorySearchScope; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'all', label: 'All', icon: Layout },
  { id: 'unmatched', label: 'Unfound', icon: AlertTriangle },
];

interface InboundWorkspaceHeaderProps {
  controlsSlotRef?: Ref<HTMLDivElement>;
  className?: string;
}

export function InboundWorkspaceHeader({ controlsSlotRef, className }: InboundWorkspaceHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const facet = normalizeDashboardInboundFacet(searchParams.get('sort'));
  const searchField = useMemo(
    () => normalizeReceivingHistorySearchField(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.field)),
    [searchParams],
  );
  const searchScope = useMemo(
    () => normalizeReceivingHistorySearchScope(searchParams.get(RECEIVING_HISTORY_URL_PARAMS.scope)),
    [searchParams],
  );

  const replaceParams = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  // Draft → debounced `?rh_q=` (deep links hydrate the field on mount).
  const urlQRaw = searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q) ?? '';
  const [draft, setDraft] = useState(urlQRaw);
  useEffect(() => {
    setDraft(urlQRaw);
  }, [urlQRaw]);
  const debouncedDraft = useDebounce(draft, 250);
  useEffect(() => {
    if (debouncedDraft.trim() === urlQRaw.trim()) return;
    replaceParams(setReceivingHistoryUrlParams(searchParams, { q: debouncedDraft }));
  }, [debouncedDraft, replaceParams, searchParams, urlQRaw]);

  const setFacet = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      const norm = normalizeDashboardInboundFacet(id);
      // Default axis stays out of the URL so a plain Inbound link is clean.
      if (norm === DASHBOARD_INBOUND_DEFAULT_FACET) next.delete('sort');
      else next.set('sort', norm);
      replaceParams(next);
    },
    [replaceParams, searchParams],
  );

  const setScope = useCallback(
    (id: string) => {
      replaceParams(
        setReceivingHistoryUrlParams(searchParams, {
          scope: normalizeReceivingHistorySearchScope(id),
        }),
      );
    },
    [replaceParams, searchParams],
  );

  const setField = useCallback(
    (id: string) => {
      replaceParams(
        setReceivingHistoryUrlParams(searchParams, {
          field: normalizeReceivingHistorySearchField(id),
        }),
      );
    },
    [replaceParams, searchParams],
  );

  const clearFilters = useCallback(() => {
    replaceParams(setReceivingHistoryUrlParams(searchParams, { scope: 'all', field: 'all' }));
  }, [replaceParams, searchParams]);

  const tabs = useMemo(
    () =>
      DASHBOARD_INBOUND_FACETS.map((option) => ({
        id: option.id as string,
        label: option.label as string,
        color: 'blue' as const,
      })),
    [],
  );

  const tableFetching =
    useIsFetching({
      predicate: (u) => Array.isArray(u.queryKey) && u.queryKey[0] === 'receiving-lines-table',
    }) > 0;

  const [filterOpen, setFilterOpen] = useState(false);
  // Scope + field each count as one refinement (their `all` is the unfiltered
  // default, so it doesn't count) — a hot filter dots the trigger.
  const filterHot = searchScope !== 'all' || searchField !== 'all';

  return (
    <WorkbenchChromeHeader
      tabs={tabs}
      activeTab={facet}
      onTabChange={setFacet}
      solidTone="accent"
      controlsSlotRef={controlsSlotRef}
      controlsSlotProps={{ 'data-inbound-controls': '' }}
      className={className}
      // Scoped list filter over ?rh_q= (header slot) — the ⌘K pill stays global.
      search={
        <SearchField
          value={draft}
          onChange={setDraft}
          onSearch={(v) => {
            setDraft(v);
            replaceParams(setReceivingHistoryUrlParams(searchParams, { q: v }));
          }}
          onClear={() => {
            setDraft('');
            replaceParams(setReceivingHistoryUrlParams(searchParams, { q: '' }));
          }}
          placeholder={getReceivingHistoryPlaceholder(searchField).replace(/^Search/, 'Filter')}
          isSearching={tableFetching}
          tone="blue"
          size="compact"
          className="w-40 shrink-0 lg:w-56"
        />
      }
      right={
        <WorkbenchFilterPopover
          open={filterOpen}
          onOpenChange={setFilterOpen}
          hot={filterHot}
          label="Carton source / search field"
        >
          <WorkbenchFilterGroupLabel>Carton source</WorkbenchFilterGroupLabel>
          {SCOPE_ITEMS.map(({ id, label, icon: Icon }) => (
            <WorkbenchFilterMenuRow
              key={id}
              label={label}
              active={searchScope === id}
              leading={<Icon className="h-3.5 w-3.5 shrink-0" />}
              onClick={() => {
                setScope(id);
                setFilterOpen(false);
              }}
            />
          ))}

          <WorkbenchFilterDivider />

          <WorkbenchFilterGroupLabel>Search field</WorkbenchFilterGroupLabel>
          {RECEIVING_HISTORY_SEARCH_FIELDS.map((field) => (
            <WorkbenchFilterMenuRow
              key={field.id}
              label={field.label}
              active={searchField === field.id}
              onClick={() => {
                setField(field.id);
                setFilterOpen(false);
              }}
            />
          ))}

          {filterHot ? (
            <>
              <WorkbenchFilterDivider />
              <WorkbenchFilterMenuRow
                label="Clear filters"
                active={false}
                onClick={() => {
                  clearFilters();
                  setFilterOpen(false);
                }}
              />
            </>
          ) : null}
        </WorkbenchFilterPopover>
      }
    />
  );
}
