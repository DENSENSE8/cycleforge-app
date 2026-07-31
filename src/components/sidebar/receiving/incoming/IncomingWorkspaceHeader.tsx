'use client';

/**
 * Incoming workbench chrome — the golden `WorkbenchChromeHeader` recipe applied
 * to the Incoming right pane (the sibling of `OutboundWorkspaceHeader`).
 *
 * Left:   purchasing-source tabs — All / Zoho / eBay.
 * Right:  [⌕ search] · [⫶ filters].
 * Trailing: [page] · [sort] · [fields] · Import · Add.
 *
 * POS ↔ Email lives in {@link IncomingSidebarPanel}. Delivery attention
 * (`?state=`) + PO date live in the filter popover. Search + refinements write
 * the SAME URL params the list reads (`?rh_q` / `?state` / `?sort` /
 * `?po_from` / `?po_to` / `?inbound`).
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';
import { WorkbenchChromeHeader, WorkbenchTrailingCluster } from '@/components/dashboard/workbench-shell';
import {
  WorkbenchFilterDivider,
  WorkbenchFilterGroupLabel,
  WorkbenchFilterMenuRow,
  WorkbenchFilterPopover,
} from '@/components/dashboard/workbench-filter-popover';
import { QueueSortSwitch } from '@/components/dashboard/QueueSortSwitch';
import { PaneHeaderPagination } from '@/components/ui/pane-header';
import { GridFieldsMenu } from '@/components/ui/table-column-config/GridFieldsMenu';
import { INCOMING_GRID_COLUMNS } from '@/lib/receiving/incoming-grid-layout';
import { ToolbarSearchToggle } from '@/components/ui/ToolbarSearchToggle';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { useDebounce } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { INCOMING_PAGE_SIZE } from '@/lib/receiving/receiving-modes';
import {
  INCOMING_SORT_OPTIONS,
  type IncomingSort,
} from '@/components/sidebar/receiving/IncomingPaneHeader';
import { RECEIVING_HISTORY_URL_PARAMS } from '@/lib/receiving-history-search';
import { IncomingSyncDialog } from '@/components/sidebar/receiving/IncomingSyncDialog';
import { useIncomingSummary } from './useIncomingSummary';
import { useIncomingFilters } from './useIncomingFilters';
import { useIncomingSyncActions } from './useIncomingSyncActions';
import { IncomingChromeActions } from './IncomingChromeActions';
import { IncomingImportEbayOverlay } from './IncomingImportEbayOverlay';
import { TILES, TONE } from './incoming-tiles';

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
  // Attention state and/or PO date — sort is its own trailing control.
  const filterHot = Boolean(filters.dateRange?.from) || filters.state != null;

  const clearWorkbenchFilters = useCallback(() => {
    filters.setDateRange(undefined);
    filters.setState(null);
  }, [filters]);

  const tabs = [
    { id: 'all', label: 'All', color: 'blue' as const },
    { id: 'zoho', label: 'Zoho', color: 'teal' as const, dividerBefore: true },
    ...(universalIncoming
      ? [{ id: 'ebay', label: 'eBay', color: 'yellow' as const }]
      : []),
  ];

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
              contentClassName="w-72 max-h-[min(70vh,32rem)] overflow-y-auto"
            >
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

              <WorkbenchFilterDivider />

              <WorkbenchFilterGroupLabel>Attention</WorkbenchFilterGroupLabel>
              {TILES.map((tile) => {
                const id = tile.state ?? 'all_issued';
                const count = summary ? (summary[tile.key] as number | undefined) : undefined;
                const active =
                  tile.state == null ? filters.state === null : filters.state === tile.state;
                return (
                  <WorkbenchFilterMenuRow
                    key={id}
                    label={tile.label}
                    count={typeof count === 'number' ? count : undefined}
                    active={active}
                    leading={
                      <tile.icon
                        className={`h-3.5 w-3.5 shrink-0 ${
                          active ? 'text-blue-600' : TONE[tile.tone].iconInactive
                        }`}
                      />
                    }
                    onClick={() => {
                      if (tile.state == null) {
                        filters.setState(null);
                      } else {
                        filters.setState(filters.state === tile.state ? null : tile.state);
                      }
                      setFilterOpen(false);
                    }}
                  />
                );
              })}

              {filterHot ? (
                <>
                  <WorkbenchFilterDivider />
                  <WorkbenchFilterMenuRow
                    label="Clear filters"
                    active={false}
                    onClick={() => {
                      clearWorkbenchFilters();
                      setFilterOpen(false);
                    }}
                  />
                </>
              ) : null}
            </WorkbenchFilterPopover>
          </>
        }
        trailing={
          <WorkbenchTrailingCluster
            before={
              <PaneHeaderPagination
                page={safePage}
                pageSize={INCOMING_PAGE_SIZE}
                total={total}
                onPrev={() => setPage(safePage - 1)}
                onNext={() => setPage(safePage + 1)}
              />
            }
            sort={
              <QueueSortSwitch<IncomingSort>
                sort={filters.sort}
                onChange={filters.setSort}
                options={INCOMING_SORT_OPTIONS}
                ariaLabel="Sort incoming POs"
              />
            }
            fields={<GridFieldsMenu tableId="receiving" columns={INCOMING_GRID_COLUMNS} />}
            actions={
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
