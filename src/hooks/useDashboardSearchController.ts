'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import {
  getDashboardOrderViewFromSearch,
  normalizeDashboardOrderViewParams,
  type DashboardOrderView,
} from '@/utils/dashboard-search-state';
import {
  readDetailsOpenBehaviorPreference,
  readShippedFilterPreference,
  readShippedSearchFieldPreference,
  writeDetailsOpenBehaviorPreference,
  writeShippedFilterPreference,
  writeShippedSearchFieldPreference,
  type DetailsOpenBehaviorPreference,
} from '@/utils/dashboard-preferences';
import { normalizeShippedSearchField, type ShippedSearchField } from '@/lib/shipped-search';
import { useDeskSearch } from '@/lib/outbound/desk-search-store';
export type ShippedTypeFilter = 'all' | 'orders' | 'sku' | 'fba';

/**
 * Ship-desk ingest rail: closed, Root Index, the manual-entry leaf (`?new=true`),
 * or the caged→released triage form (`?triage=new|<orderId>`).
 */
export type OutboundIngestMode = 'closed' | 'index' | 'manual' | 'triage';

export function useDashboardSearchController() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const orderView = getDashboardOrderViewFromSearch(searchParams);
  // Search is desk-local and never in the URL (URL replacement per character
  // causes a soft navigation/remount and clears the controlled table field).
  // One in-memory query per desk path, shared with the desk sidebar's input.
  const [searchQuery, setSearchQuery] = useDeskSearch(pathname || '/shipping/orders');
  const shippedFilterParam = searchParams.get('shippedFilter');
  const shippedFilter: ShippedTypeFilter = useMemo(() => {
    if (shippedFilterParam === 'orders') return 'orders';
    if (shippedFilterParam === 'sku') return 'sku';
    if (shippedFilterParam === 'fba') return 'fba';
    return readShippedFilterPreference() ?? 'all';
  }, [shippedFilterParam]);
  const shippedSearchFieldParam = searchParams.get('shippedSearchField');
  const shippedSearchField: ShippedSearchField = useMemo(() => {
    if (shippedSearchFieldParam != null) {
      return normalizeShippedSearchField(shippedSearchFieldParam);
    }
    return readShippedSearchFieldPreference() ?? 'all';
  }, [shippedSearchFieldParam]);
  const detailsOpenBehavior: DetailsOpenBehaviorPreference = useMemo(
    () => readDetailsOpenBehaviorPreference(),
    [],
  );
  // FBA renders its own detail surface, not the shipped/unshipped panel.
  const detailsEnabled = true;

  const deskPath = pathname || '/shipping/orders';

  const updateSearch = useCallback((mutate: (params: URLSearchParams) => void, nextPathname = deskPath) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    mutate(nextParams);
    const targetPath = nextPathname || pathname || '/shipping/orders';
    const nextSearch = nextParams.toString();
    router.replace(nextSearch ? `${targetPath}?${nextSearch}` : targetPath, { scroll: false });
  }, [deskPath, pathname, router, searchParams]);

  const urlIngestMode = useMemo((): OutboundIngestMode => {
    if (searchParams.get('triage')) return 'triage';
    if (searchParams.get('new') === 'true') return 'manual';
    if (searchParams.get('ingest') === 'true') return 'index';
    return 'closed';
  }, [searchParams]);

  /**
   * Which order the triage form is bound to. `?triage=new` is a form with no
   * order yet, so it reads as `null` — the same value the form uses to mean
   * "Identity has not created anything". A non-numeric value that is not `new`
   * is treated as `new` rather than throwing: a mangled link should open the
   * intake, not break the desk.
   */
  const triageOrderId = useMemo((): number | null => {
    const raw = String(searchParams.get('triage') || '').trim();
    if (!raw || raw === 'new') return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [searchParams]);

  const replaceIngest = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      updateSearch(mutate);
    },
    [updateSearch],
  );

  /**
   * Which order a pending `triage` write should bind to. A ref, not state,
   * because it is an ARGUMENT to the next write rather than something the UI
   * renders — and because `writeIngest` must stay a stable callback (it is the
   * optimistic hook's writer; re-creating it re-arms the paint channel).
   */
  const triageTargetRef = useRef<string>('new');

  const writeIngest = useCallback((params: URLSearchParams, next: OutboundIngestMode) => {
    params.delete('ingest');
    params.delete('new');
    if (next === 'index') params.set('ingest', 'true');
    if (next === 'manual') params.set('new', 'true');
    if (next === 'triage') params.set('triage', triageTargetRef.current);
    else params.delete('triage');
  }, []);

  const { value: ingestMode, setValue: setIngestMode } = useOptimisticUrlParam<OutboundIngestMode>({
    urlValue: urlIngestMode,
    replace: replaceIngest,
    write: writeIngest,
    shareKey: 'outbound-order-ingest',
  });

  const setSearch = useCallback((nextValue: string) => setSearchQuery(nextValue), []);

  const setOrderView = useCallback((nextView: DashboardOrderView) => {
    updateSearch((params) => {
      normalizeDashboardOrderViewParams(params, nextView);
    });
  }, [updateSearch]);

  const setShippedFilter = useCallback((value: ShippedTypeFilter) => {
    writeShippedFilterPreference(value);
    updateSearch((params) => {
      if (value === 'all') params.delete('shippedFilter');
      else params.set('shippedFilter', value);
    });
  }, [updateSearch]);

  const setShippedSearchField = useCallback((value: ShippedSearchField) => {
    writeShippedSearchFieldPreference(value);
    updateSearch((params) => {
      if (value === 'all') params.delete('shippedSearchField');
      else params.set('shippedSearchField', value);
    });
  }, [updateSearch]);

  const setDetailsOpenBehavior = useCallback((value: DetailsOpenBehaviorPreference) => {
    writeDetailsOpenBehaviorPreference(value);
  }, []);

  const showIntakeForm = ingestMode === 'manual';
  const showIngestRail = ingestMode !== 'closed';
  const ingestLeaf: 'index' | 'manual' | 'triage' =
    ingestMode === 'manual' ? 'manual' : ingestMode === 'triage' ? 'triage' : 'index';

  const openIntakeForm = useCallback(() => setIngestMode('manual'), [setIngestMode]);
  const openIngestIndex = useCallback(() => setIngestMode('index'), [setIngestMode]);
  const closeIntakeForm = useCallback(() => setIngestMode('closed'), [setIngestMode]);

  /**
   * Open the triage form — on a caged order, or on a blank one.
   *
   * Goes through `setIngestMode`, NOT a direct URL write. The optimistic
   * channel only clears its pending value when the URL matches what it wrote,
   * so a write that bypasses it while a `closed` (or `index`) write is still in
   * flight leaves the rail painting the stale pending mode until something else
   * moves it. Every other ingest mode already learned this — see the auto-close
   * note on `OrderIngestRail`.
   */
  const openTriage = useCallback(
    (orderId?: number | null) => {
      triageTargetRef.current = orderId && orderId > 0 ? String(orderId) : 'new';
      setIngestMode('triage');
    },
    [setIngestMode],
  );

  /**
   * Re-point the open form at the order Identity just created, so a refresh or
   * a shared link lands back on the same half-triaged order instead of a blank
   * form. `replace`, not push — this is the same step, not a new one.
   */
  const bindTriageOrder = useCallback(
    (orderId: number) => {
      // Safe as a direct write: the rail is already open on `triage`, so the
      // mode is not changing and there is no pending mode write to race. Only
      // the bound id moves.
      triageTargetRef.current = String(orderId);
      updateSearch((params) => {
        params.set('triage', String(orderId));
      });
    },
    [updateSearch],
  );
  useEffect(() => {
    writeShippedFilterPreference(shippedFilter);
  }, [shippedFilter]);

  useEffect(() => {
    writeShippedSearchFieldPreference(shippedSearchField);
  }, [shippedSearchField]);

  return {
    orderView,
    searchQuery,
    shippedFilter,
    shippedSearchField,
    detailsOpenBehavior,
    showIntakeForm,
    showIngestRail,
    ingestLeaf,
    triageOrderId,
    detailsEnabled,
    setSearch,
    setOrderView,
    setShippedFilter,
    setShippedSearchField,
    setDetailsOpenBehavior,
    openIntakeForm,
    openIngestIndex,
    closeIntakeForm,
    openTriage,
    bindTriageOrder,
  };
}
