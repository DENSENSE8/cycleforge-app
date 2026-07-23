'use client';

/**
 * Incoming workbench chrome — the golden `WorkbenchChromeHeader` recipe applied
 * to the Incoming right pane (the sibling of `OutboundWorkspaceHeader`).
 *
 * Left:   purchasing-source tabs — All / Zoho / eBay.
 * Right:  [⌕ search] · [⫶ filters] · pagination.
 * Trailing: Import (platform picker → Zoho / eBay) · Add (manual eBay order).
 *
 * Search + filters write the SAME URL params the list reads (`?rh_q` / `?state` /
 * `?sort` / `?po_from` / `?po_to`). Import opens a source popover, then runs the
 * matching sync via {@link useIncomingSyncActions}.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { PaneHeaderPagination } from '@/components/ui/pane-header';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useDebounce } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { INCOMING_PAGE_SIZE } from '@/lib/receiving/receiving-modes';
import { INCOMING_SORT_LABELS, type IncomingSort } from '@/components/sidebar/receiving/IncomingPaneHeader';
import { RECEIVING_HISTORY_URL_PARAMS } from '@/lib/receiving-history-search';
import { IncomingSyncDialog } from '@/components/sidebar/receiving/IncomingSyncDialog';
import { useIncomingSummary } from './useIncomingSummary';
import { useIncomingFilters } from './useIncomingFilters';
import { useIncomingSyncActions } from './useIncomingSyncActions';
import { IncomingChromeActions } from './IncomingChromeActions';
import { IncomingImportEbayOverlay } from './IncomingImportEbayOverlay';
import { TILES } from './incoming-tiles';

type IncomingSourceTab = 'all' | 'zoho' | 'ebay';

interface IncomingWorkspaceHeaderProps {
  /** Total matching rows across all pages (from `total` in the list response). */
  total: number;
  /** Current 1-based page index (`?page=`). */
  page: number;
}

export function IncomingWorkspaceHeader({
  total,
  page,
}: IncomingWorkspaceHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const base = receivingSurfaceBasePath(pathname);
  const summary = useIncomingSummary();
  const filters = useIncomingFilters();
  const sync = useIncomingSyncActions();
  const { has } = useAuth();
  const canAddEbay = has('integrations.ebay');
  const universalIncoming = summary?.universal_incoming ?? false;

  const [addOpen, setAddOpen] = useState(false);
  const [addOrderId, setAddOrderId] = useState('');

  useEffect(() => {
    const onStationImport = (event: Event) => {
      const detail = (event as CustomEvent<{ orderId?: string; order_id?: string }>).detail;
      const prefill = (detail?.orderId || detail?.order_id || '').trim();
      setAddOrderId(prefill);
      setAddOpen(true);
    };
    window.addEventListener('station:import-ebay-order', onStationImport);
    return () => window.removeEventListener('station:import-ebay-order', onStationImport);
  }, []);

  const activeSource: IncomingSourceTab = (() => {
    const raw = (searchParams.get('inbound') || '').trim().toLowerCase();
    return raw === 'ebay' ? 'ebay' : raw === 'zoho' ? 'zoho' : 'all';
  })();

  const totalPages = Math.max(1, Math.ceil(total / INCOMING_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const setPage = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next <= 1) params.delete('page');
      else params.set('page', String(next));
      router.replace(`${base}?${params.toString()}`);
    },
    [router, searchParams, base],
  );

  const setSource = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id === 'all') params.delete('inbound');
      else params.set('inbound', id);
      params.delete('page');
      router.replace(`${base}?${params.toString()}`);
    },
    [router, searchParams, base],
  );

  const urlQRaw = searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q) ?? '';
  const [draft, setDraft] = useState(urlQRaw);
  useEffect(() => {
    setDraft(urlQRaw);
  }, [urlQRaw]);
  const debouncedDraft = useDebounce(draft, 250);
  useEffect(() => {
    if (debouncedDraft.trim() === urlQRaw.trim()) return;
    filters.setSearch(debouncedDraft);
  }, [debouncedDraft, urlQRaw, filters]);

  const [filterOpen, setFilterOpen] = useState(false);
  const filterHot = filters.activeFilterCount > 0;

  const tabs = [
    { id: 'all', label: 'All', color: 'blue' as const },
    { id: 'zoho', label: 'Zoho', color: 'teal' as const, dividerBefore: true },
    ...(universalIncoming
      ? [{ id: 'ebay', label: 'eBay', color: 'yellow' as const }]
      : []),
  ];

  const statusTiles = TILES.filter((t) => t.state != null);
  const sortKeys = Object.keys(INCOMING_SORT_LABELS) as IncomingSort[];
  const showCarrierBreakdown = summary?.by_carrier?.some(
    (c) => c.delivered_unscanned || c.tracking_unavailable || c.in_transit || c.carrier_mismatch,
  );

  return (
    <>
      <WorkbenchChromeHeader
        tabs={tabs}
        activeTab={activeSource}
        onTabChange={setSource}
        solidTone="accent"
        search={
          <ToolbarSearchToggle
            value={draft}
            onChange={setDraft}
            onClear={() => {
              setDraft('');
              filters.setSearch('');
            }}
            placeholder="Filter PO #, tracking, SKU…"
            tone="blue"
          />
        }
        right={
          <>
            <WorkbenchFilterPopover
              open={filterOpen}
              onOpenChange={setFilterOpen}
              hot={filterHot}
              label="Filters"
              contentClassName="w-80 max-h-[min(70vh,32rem)] overflow-y-auto"
            >
              <WorkbenchFilterGroupLabel>Status</WorkbenchFilterGroupLabel>
              {statusTiles.map((tile) => {
                const active = filters.state === tile.state;
                const count = summary ? (summary[tile.key] as number | undefined) : undefined;
                const Icon = tile.icon;
                return (
                  <WorkbenchFilterMenuRow
                    key={tile.label}
                    label={tile.label}
                    count={typeof count === 'number' ? count : undefined}
                    active={active}
                    leading={<Icon className="h-3.5 w-3.5 shrink-0" />}
                    onClick={() => {
                      filters.setState(active ? null : tile.state);
                      setFilterOpen(false);
                    }}
                  />
                );
              })}

              <WorkbenchFilterDivider />

              <WorkbenchFilterGroupLabel>Sort</WorkbenchFilterGroupLabel>
              {sortKeys.map((key) => (
                <WorkbenchFilterMenuRow
                  key={key}
                  label={INCOMING_SORT_LABELS[key]}
                  active={filters.sort === key}
                  onClick={() => {
                    filters.setSort(key);
                    setFilterOpen(false);
                  }}
                />
              ))}

              <WorkbenchFilterDivider />

              <WorkbenchFilterGroupLabel>PO purchased between</WorkbenchFilterGroupLabel>
              <div className="px-2 pb-2">
                <DateRangePickerField
                  value={filters.dateRange}
                  onChange={filters.setDateRange}
                  placeholder="Any date"
                />
                <p className="mt-1 text-role-eyebrow font-medium text-text-faint">
                  Date in header is when the PO was created
                </p>
              </div>

              {showCarrierBreakdown ? (
                <>
                  <WorkbenchFilterDivider />
                  <WorkbenchFilterGroupLabel>By carrier</WorkbenchFilterGroupLabel>
                  <div className="mx-1 mb-1 overflow-hidden rounded-md ring-1 ring-inset ring-border-soft">
                    <div className="grid grid-cols-[minmax(0,1fr)_2.25rem_2.75rem_2.25rem_2.25rem] items-center gap-x-1 bg-surface-canvas px-2 py-1 text-role-micro uppercase tracking-wide text-text-faint">
                      <span>Carrier</span>
                      <HoverTooltip label="In transit" asChild>
                        <span className="text-right tabular-nums">Trans</span>
                      </HoverTooltip>
                      <HoverTooltip label="Tracking unavailable" asChild>
                        <span className="text-right tabular-nums">Unav</span>
                      </HoverTooltip>
                      <HoverTooltip label="Delivered · not scanned" asChild>
                        <span className="text-right tabular-nums">Deliv</span>
                      </HoverTooltip>
                      <HoverTooltip label="Carrier mismatch — carrier/number don’t match" asChild>
                        <span className="text-right tabular-nums">Miss</span>
                      </HoverTooltip>
                    </div>
                    {summary!.by_carrier!.map((c) => (
                      <div
                        key={c.carrier}
                        className="grid grid-cols-[minmax(0,1fr)_2.25rem_2.75rem_2.25rem_2.25rem] items-center gap-x-1 border-t border-border-hairline px-2 py-1 text-role-caption"
                      >
                        <span className="truncate font-bold text-text-muted">
                          {c.carrier === 'UNKNOWN' ? 'Other' : c.carrier}
                        </span>
                        <span
                          className={`text-right font-bold tabular-nums ${c.in_transit ? 'text-blue-600' : 'text-text-faint'}`}
                        >
                          {c.in_transit}
                        </span>
                        <span
                          className={`text-right font-bold tabular-nums ${c.tracking_unavailable ? 'text-violet-600' : 'text-text-faint'}`}
                        >
                          {c.tracking_unavailable}
                        </span>
                        <span
                          className={`text-right font-bold tabular-nums ${c.delivered_unscanned ? 'text-emerald-600' : 'text-text-faint'}`}
                        >
                          {c.delivered_unscanned}
                        </span>
                        <span
                          className={`text-right font-bold tabular-nums ${c.carrier_mismatch ? 'text-red-600' : 'text-text-faint'}`}
                        >
                          {c.carrier_mismatch}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              {filterHot ? (
                <>
                  <WorkbenchFilterDivider />
                  <WorkbenchFilterMenuRow
                    label="Clear filters"
                    active={false}
                    onClick={() => {
                      filters.clearFilters();
                      setFilterOpen(false);
                    }}
                  />
                </>
              ) : null}
            </WorkbenchFilterPopover>

            <PaneHeaderPagination
              page={safePage}
              pageSize={INCOMING_PAGE_SIZE}
              total={total}
              onPrev={() => setPage(safePage - 1)}
              onNext={() => setPage(safePage + 1)}
            />
          </>
        }
        trailing={
          <IncomingChromeActions
            onImportZoho={() => {
              void sync.refreshZoho();
            }}
            onImportEbay={() => {
              void sync.refreshMarketplace();
            }}
            onAdd={() => {
              setAddOrderId('');
              setAddOpen(true);
            }}
            importingZoho={sync.zohoRefreshing}
            importingEbay={sync.marketplaceRefreshing}
            canImportZoho
            canImportEbay={universalIncoming && canAddEbay}
            canAdd={canAddEbay}
          />
        }
      />

      <IncomingImportEbayOverlay
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setAddOrderId('');
        }}
        initialOrderId={addOrderId}
      />

      <IncomingSyncDialog
        open={sync.incSyncOpen}
        kind={sync.incSyncKind}
        isRunning={sync.incSyncRunning}
        elapsedMs={sync.incSyncElapsedMs}
        result={sync.incSyncResult}
        onClose={() => sync.setIncSyncOpen(false)}
      />
    </>
  );
}
