'use client';

/**
 * Phone to-ship queue — canonical `/m/orders`; `/m/work` is a compatibility
 * alias.
 *
 * Industrial two-row bar (view tabs · tools: search icon, platform, sort,
 * Ledger, sync icon), sort including Title A–Z. White floor; raised white cards. Product thumb,
 * qty, and condition use the existing item-record / grade faces. Out of
 * stock writes through useOrderAssignment and disables Ship.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown, RefreshCw, Search, X } from '@/components/Icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  SearchField,
} from '@/design-system/primitives';
import { DESK_BAR_SEGMENT_CLASS, deskBarSegmentTone } from '@/design-system/components/DeskActionSlot';
import { cn } from '@/utils/_cn';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { bandWorkOrderRows } from '@/lib/work-orders/deadline-bands';
import {
  MOBILE_TO_SHIP_SORTS,
  MOBILE_TO_SHIP_TABS,
  MOBILE_ORDER_VIEWS,
  filterToShipByOrderView,
  filterToShipByPlatform,
  filterToShipByQuery,
  filterToShipByTab,
  isToShipOutOfStock,
  parseMobileOrderView,
  parseMobileToShipSort,
  parseMobileToShipTab,
  sortToShipRows,
  type MobileToShipSort,
  type MobileToShipTab,
} from '@/lib/work-orders/to-ship-assignment';
import { MobileToShipRow } from '@/components/mobile/redesign/MobileToShipRow';
import { MobileToShipSheet } from '@/components/mobile/redesign/MobileToShipSheet';
import { MobileToShipPickerSheet } from '@/components/mobile/redesign/MobileToShipPickerSheet';
import { useToShipOrders, type MobileToShipFeed } from '@/components/mobile/redesign/useToShipOrders';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import type { WorkOrderRow } from '@/components/work-orders/types';
import type { OrderShortageIdentity } from '@/lib/orders/order-shortage-identity';
import { useAuth } from '@/contexts/AuthContext';
import { MobileOrderExceptions } from '@/components/mobile/outbound/MobileOrderExceptions';
import type { OutboundPriorityAction, OutboundTriageActionId } from '@/lib/shipping/outbound-workflow-actions';
import { MobileOrderRecord } from '@/components/mobile/orders/MobileOrderRecord';
import { MobileOrderEvidenceSheet } from '@/components/mobile/orders/MobileOrderEvidenceSheet';
import { MobileLinePhotoViewer } from '@/components/mobile/orders/MobileLinePhotoViewer';
import { getCurrentPSTDateKey } from '@/utils/date';

/**
 * `?display=ledger` — the desk's industrial record ported to the phone
 * (owner 2026-09-24), mounted beside the governed card roster so the floor
 * can test the record, the evidence sheet and the pick → pack walk before
 * it replaces the cards. Cards stay the default.
 */
type MobileOrdersDisplay = 'cards' | 'ledger';

/** Phone order import — its own screen, with its own X (see MobileOrderSyncScreen). */
const ORDER_SYNC_HREF = '/m/orders/sync';

export function MobileToShipQueue({
  feed = 'unshipped',
  showImportSync: allowImportSync = true,
}: {
  feed?: MobileToShipFeed;
  showImportSync?: boolean;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseMobileToShipTab(searchParams.get('tab'));
  const orderView = parseMobileOrderView(searchParams.get('view'));
  const sort = parseMobileToShipSort(searchParams.get('sort'));
  const searchQuery = searchParams.get('q') ?? '';
  const display: MobileOrdersDisplay = searchParams.get('display') === 'ledger' ? 'ledger' : 'cards';
  const requestedPlatform = searchParams.get('platform') ?? 'all';
  const { rows, isPending, isError, isFetching } = useToShipOrders({
    enabled: orderView !== 'exceptions',
    searchQuery,
    feed,
  });
  const { getStaffName } = useStaffNameMap();
  const { mutate: assignOrder } = useOrderAssignment();
  // Orders owns the canonical queue projection. Its one shared Ably subscriber
  // invalidates the same cache keys as desk and station readers; no page-local
  // socket or direct database listener is allowed here.
  useRealtimeInvalidation({ dashboard: true, reconnect: true });
  const [sheetRow, setSheetRow] = useState<WorkOrderRow | null>(null);
  const [activeRow, setActiveRow] = useState<WorkOrderRow | null>(null);
  const [passPickRow, setPassPickRow] = useState<WorkOrderRow | null>(null);
  const [oosIds, setOosIds] = useState<ReadonlySet<number>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [photosRow, setPhotosRow] = useState<WorkOrderRow | null>(null);
  const closePhotos = useCallback(() => setPhotosRow(null), []);
  // Recomputed on the minute tick so lateness self-heals across PST midnight.
  const todayKey = useMemo(() => getCurrentPSTDateKey(), [now]); // eslint-disable-line react-hooks/exhaustive-deps
  // The sheet reads the LIVE row, so an assignment or hold repaints it.
  const evidenceRow = useMemo(
    () => (evidenceId ? rows.find((row) => row.id === evidenceId) ?? null : null),
    [evidenceId, rows],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  /**
   * Assignment tabs belong to PICKS, not to Orders (operator 2026-09-15:
   * *"orders should just be in orders display while the picks should be the
   * component that displays all assigned and unassigned"*).
   *
   * Orders is the in-warehouse to-ship list — one job, no assignment state to
   * refine by. Picks is where work is claimed, so All · Assigned · Unassigned
   * is its question. With the strip gone from Orders, a stale `?tab=` in a
   * bookmark must not silently filter that list either, so the FEED decides the
   * effective tab rather than the URL.
   */
  const showAssignmentTabs = feed === 'pending';
  const activeTab = showAssignmentTabs ? tab : 'all';
  const platforms = useMemo(
    () => Array.from(new Set(rows.map((row) => row.accountSource?.trim()).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const platform = platforms.some((candidate) => candidate.toLowerCase() === requestedPlatform.toLowerCase())
    ? platforms.find((candidate) => candidate.toLowerCase() === requestedPlatform.toLowerCase()) ?? 'all'
    : 'all';

  const groups = useMemo(() => {
    const viewRows = orderView === 'exceptions'
      ? []
      : filterToShipByOrderView(rows, orderView);
    const filtered = sortToShipRows(
      filterToShipByQuery(
        filterToShipByPlatform(filterToShipByTab(viewRows, activeTab), platform),
        searchQuery,
        getStaffName,
      ),
      sort,
      getStaffName,
    );
    if (sort !== 'deadline') {
      return filtered.length > 0 ? [{ band: 'none' as const, label: '', rows: filtered }] : [];
    }
    return bandWorkOrderRows(filtered);
  }, [activeTab, getStaffName, orderView, platform, rows, searchQuery, sort]);

  const replaceParams = useCallback(
    (patch: {
      tab?: MobileToShipTab;
      view?: typeof orderView;
      sort?: MobileToShipSort;
      q?: string;
      platform?: string;
      display?: MobileOrdersDisplay;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (patch.tab) params.set('tab', patch.tab);
      if (patch.view) params.set('view', patch.view);
      if (patch.sort) params.set('sort', patch.sort);
      if (patch.q !== undefined) {
        const next = patch.q.trim();
        if (next) params.set('q', next);
        else params.delete('q');
      }
      if (patch.platform !== undefined) {
        if (patch.platform === 'all') params.delete('platform');
        else params.set('platform', patch.platform);
      }
      if (patch.display !== undefined) {
        if (patch.display === 'cards') params.delete('display');
        else params.set('display', patch.display);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const onOutOfStock = useCallback(
    (row: WorkOrderRow, identity?: OrderShortageIdentity) => {
      setOosIds((current) => {
        if (current.has(row.entityId)) return current;
        const next = new Set(current);
        next.add(row.entityId);
        return next;
      });
      assignOrder(
        {
          orderId: row.entityId,
          isOutOfStock: true,
          ...(identity
            ? {
                oosKind: identity.kind,
                oosSku: identity.sku,
                oosSkuCatalogId: identity.skuCatalogId,
                oosKitPartId: identity.kitPartId,
                oosQtyShort: identity.qtyShort,
                oosTitle: identity.title,
                oosZohoItemId: identity.zohoItemId,
                oosItemId: identity.itemId,
              }
            : {}),
        },
        {
          onError: () => {
            setOosIds((current) => {
              if (!current.has(row.entityId)) return current;
              const next = new Set(current);
              next.delete(row.entityId);
              return next;
            });
          },
        },
      );
      setSheetRow((current) => (current?.id === row.id ? null : current));
    },
    [assignOrder],
  );

  const onClearHold = useCallback(
    (row: WorkOrderRow) => {
      assignOrder(
        {
          orderId: row.entityId,
          isOutOfStock: false,
          outOfStock: null,
        },
        {
          onSuccess: () => {
            setOosIds((current) => {
              if (!current.has(row.entityId)) return current;
              const next = new Set(current);
              next.delete(row.entityId);
              return next;
            });
            setSheetRow((current) =>
              current?.id === row.id ? { ...current, outOfStock: null } : current,
            );
          },
        },
      );
    },
    [assignOrder],
  );

  const onTriage = useCallback(async (row: WorkOrderRow, action: OutboundTriageActionId) => {
    if (action === 'out_of_stock') return;
    const flag = action === 'damaged' ? 'damaged' : 'discrepancy';
    const response = await fetch(`/api/orders/${row.entityId}/flag`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag }),
    });
    if (!response.ok) throw new Error('Could not record order triage.');
    setSheetRow(null);
  }, []);

  const onOpenDetail = useCallback(
    (row: WorkOrderRow) => {
      setSheetRow(null);
      // ORDER rows carry the desk's `/dashboard?pending=` as sourcePath; the
      // phone opens the order hub, by public order # when known, else by pk.
      const target = row.sourcePath?.startsWith('/m/')
        ? row.sourcePath
        : row.orderId
          ? `/m/orders/${encodeURIComponent(row.orderId)}`
          : `/m/orders/${row.entityId}?by=id`;
      router.push(withJobReturn(target, pathname));
    },
    [router, pathname],
  );

  const onPriorityAction = useCallback(
    (row: WorkOrderRow, action: OutboundPriorityAction) => {
      assignOrder({
        orderId: row.entityId,
        isUrgent: action.id === 'mark_urgent',
      });
    },
    [assignOrder],
  );

  const onRowTriage = useCallback(
    (row: WorkOrderRow, action: OutboundTriageActionId) => {
      if (action === 'out_of_stock') {
        onOutOfStock(row);
        return;
      }
      void onTriage(row, action);
    },
    [onOutOfStock, onTriage],
  );

  const onRowHold = useCallback(
    (row: WorkOrderRow) => {
      if (oosIds.has(row.entityId) || isToShipOutOfStock(row)) onClearHold(row);
      else onOutOfStock(row);
    },
    [onClearHold, onOutOfStock, oosIds],
  );

  /**
   * Importing orders is a PHONE verb (SURFACE_LAW: every operator verb must be
   * completable on `/m` first), so Sync lives on this screen.
   *
   * Operator 2026-09-24: it is a refresh ICON, the last cell at the right end of
   * the tool row (row 2 of the industrial bar) — not a labelled button in the
   * content, not in the host header, not a third strip. Earlier homes that were
   * rejected (2026-09-15): an icon in the middle of the tab row, the shell's
   * `MobileActionSlot` seat beside Scan, and its own bordered band.
   *
   * OUTBOUND ORDERS ONLY. This component is also `/m/pick` (`feed="pending"`),
   * a picking queue that imports nothing, so it is gated on the feed as well as
   * the permission.
   */
  const { has } = useAuth();
  const showImportSync = allowImportSync && feed === 'unshipped' && has('orders.import');

  const sortLabel = MOBILE_TO_SHIP_SORTS.find((option) => option.id === sort)?.label ?? 'Ship by';
  /**
   * Search is an icon cell until pressed (operator 2026-09-24: "a search icon,
   * not a full search header"). Pressed, the field takes over row 2; closing it
   * clears the query. A query that arrives by URL keeps the icon ink-filled so
   * a filtered list never looks unfiltered.
   */
  const [searchOpen, setSearchOpen] = useState(false);
  const searchActive = Boolean(searchQuery.trim());
  /**
   * Per-view counts inline on the tabs, as the desk's mode segments carry them.
   * Exceptions reads its own feed, so it has no count here; while the queue is
   * loading (or disabled with nothing cached) no view gets a count rather than
   * a false zero.
   */
  const viewCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (isPending) return counts;
    for (const view of MOBILE_ORDER_VIEWS) {
      if (view.id === 'exceptions') continue;
      counts.set(view.id, filterToShipByOrderView(rows, view.id).length);
    }
    return counts;
  }, [isPending, rows]);

  return (
    <div data-testid="to-ship-queue" className="flex h-full min-h-full flex-col bg-surface-card">
      {/*
        The desk's industrial bar, on the phone (operator 2026-09-24): two rows,
        both flush mono segments — full row height, square, a 1px edge between
        neighbours, active/pressed = ink fill. Row 1 is the view tabs; row 2 is
        the tools (search icon · platform · sort · display) with Sync as the
        right-most icon.
      */}
      <div className="shrink-0 bg-mode-bar">
        <div
          role="tablist"
          aria-label="Order views"
          data-testid="mobile-order-view-tabs"
          className="flex min-h-11 min-w-0 items-stretch overflow-x-auto border-b-2 border-mode-ink"
        >
          {MOBILE_ORDER_VIEWS.map((option) => {
            const selected = option.id === orderView;
            const count = viewCounts.get(option.id);
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={`mobile-order-view-${option.id}`}
                onClick={() => replaceParams({ view: option.id })}
                className={cn(DESK_BAR_SEGMENT_CLASS, 'border-r border-mode-edge', deskBarSegmentTone(selected))}
              >
                <span>{option.label}</span>
                {count !== undefined ? (
                  <span className="tabular-nums">{count > 99 ? '99+' : count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        {showAssignmentTabs ? (
          // Picks only (`feed="pending"`): its assignment question gets its own
          // row in the same face. Orders never paints it.
          <div
            role="tablist"
            aria-label="Pick assignment"
            data-testid="to-ship-tablist"
            className="flex min-h-11 min-w-0 items-stretch overflow-x-auto border-b border-mode-rule"
          >
            {MOBILE_TO_SHIP_TABS.map((option) => {
              const selected = option.id === activeTab;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => replaceParams({ tab: option.id })}
                  className={cn(DESK_BAR_SEGMENT_CLASS, 'border-r border-mode-edge', deskBarSegmentTone(selected))}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
        {orderView !== 'exceptions' ? (
          <div
            data-testid="to-ship-tools"
            className="flex min-h-11 min-w-0 items-stretch border-b border-mode-rule"
          >
            {searchOpen ? (
              <>
                <div data-testid="to-ship-search" className="flex min-w-0 flex-1 items-center pl-2">
                  <SearchField
                    value={searchQuery}
                    onChange={(value) => replaceParams({ q: value })}
                    placeholder="Search product, SKU, item…"
                    tone="neutral"
                    hideUnderline
                    autoFocus
                    isSearching={isFetching && searchActive}
                  />
                </div>
                <button
                  type="button"
                  aria-label="Close search"
                  data-testid="to-ship-search-close"
                  onClick={() => {
                    setSearchOpen(false);
                    if (searchActive) replaceParams({ q: '' });
                  }}
                  className={cn(DESK_BAR_SEGMENT_CLASS, 'w-11 justify-center border-l border-mode-edge px-0', deskBarSegmentTone(false))}
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  aria-label={searchActive ? `Search, filtered by ${searchQuery.trim()}` : 'Search'}
                  aria-pressed={searchActive}
                  data-testid="to-ship-search-open"
                  onClick={() => setSearchOpen(true)}
                  className={cn(DESK_BAR_SEGMENT_CLASS, 'w-11 justify-center border-r border-mode-edge px-0', deskBarSegmentTone(searchActive))}
                >
                  <Search className="h-5 w-5" aria-hidden />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      data-testid="to-ship-platform-filter"
                      aria-label={`Platform filter, ${platform === 'all' ? 'All platforms' : platform}`}
                      className={cn(DESK_BAR_SEGMENT_CLASS, 'min-w-0 border-r border-mode-edge', deskBarSegmentTone(platform !== 'all'))}
                    >
                      <span className="truncate">{platform === 'all' ? 'Platforms' : platform}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Connected platform</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => replaceParams({ platform: 'all' })}>All platforms</DropdownMenuItem>
                    {platforms.map((candidate) => (
                      <DropdownMenuItem key={candidate} onSelect={() => replaceParams({ platform: candidate })}>
                        {candidate}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Sort, ${sortLabel}`}
                      data-testid="to-ship-sort"
                      className={cn(DESK_BAR_SEGMENT_CLASS, 'w-11 justify-center border-r border-mode-edge px-0', deskBarSegmentTone(false))}
                    >
                      <ArrowUpDown className="h-5 w-5" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Sort</DropdownMenuLabel>
                    {MOBILE_TO_SHIP_SORTS.map((option) => (
                      <DropdownMenuItem
                        key={option.id}
                        onSelect={() => replaceParams({ sort: option.id })}
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  type="button"
                  aria-pressed={display === 'ledger'}
                  data-testid="to-ship-display-ledger"
                  onClick={() => replaceParams({ display: display === 'ledger' ? 'cards' : 'ledger' })}
                  className={cn(DESK_BAR_SEGMENT_CLASS, 'border-r border-mode-edge', deskBarSegmentTone(display === 'ledger'))}
                >
                  Ledger
                </button>
                {showImportSync ? (
                  <button
                    type="button"
                    aria-label="Sync orders"
                    data-testid="to-ship-sync"
                    onClick={() => router.push(ORDER_SYNC_HREF)}
                    className={cn(DESK_BAR_SEGMENT_CLASS, 'ml-auto w-11 justify-center border-l border-mode-edge px-0', deskBarSegmentTone(false))}
                  >
                    <RefreshCw className="h-5 w-5" aria-hidden />
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      {orderView === 'exceptions' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <MobileOrderExceptions />
        </div>
      ) : (
      <div data-testid="to-ship-roster" className="min-h-0 flex-1 overflow-y-auto bg-surface-card">
        <div>
          {isPending ? (
            <p className="p-3 text-role-caption text-text-muted">Loading…</p>
          ) : isError ? (
            <p className="p-3 text-role-caption text-text-muted">Couldn&apos;t load orders.</p>
          ) : groups.length === 0 ? (
            <p className="p-3 text-role-caption text-text-muted">
              {searchQuery.trim() ? 'No matching orders.' : 'No orders in this view.'}
            </p>
          ) : (
            <div className="flex flex-col gap-3 pt-3">
              {groups.map((group) => (
                <section key={group.band + group.label}>
                  {group.label ? (
                    <h2 className="mb-1.5 px-3 text-role-eyebrow font-semibold uppercase tracking-widest text-text-warning">
                      {group.label}
                    </h2>
                  ) : null}
                  <ul className={cn('flex flex-col', display === 'ledger' && 'border-t border-mode-ink')}>
                    {group.rows.map((row) => {
                      const blocked = oosIds.has(row.entityId) || isToShipOutOfStock(row);
                      return (
                        <li key={row.id}>
                          {display === 'ledger' ? (
                            <MobileOrderRecord
                              row={row}
                              blocked={blocked}
                              todayKey={todayKey}
                              onOpen={(next) => setEvidenceId(next.id)}
                            />
                          ) : (
                            <MobileToShipRow
                              row={row}
                              resolveName={getStaffName}
                              blocked={blocked}
                              onOpen={setActiveRow}
                              onOpenSheet={setSheetRow}
                              onPassPick={setPassPickRow}
                              onPriorityAction={onPriorityAction}
                              onTriage={onRowTriage}
                              onHold={onRowHold}
                              now={now}
                              active={activeRow?.id === row.id}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      <MobileOrderEvidenceSheet
        row={evidenceRow}
        blocked={evidenceRow ? oosIds.has(evidenceRow.entityId) || isToShipOutOfStock(evidenceRow) : false}
        todayKey={todayKey}
        resolveName={getStaffName}
        onClose={() => setEvidenceId(null)}
        onPassPick={setPassPickRow}
        onPriorityAction={onPriorityAction}
        onHold={onRowHold}
        onTriage={onRowTriage}
        onOpenPhotos={setPhotosRow}
        onOpenDocuments={setSheetRow}
        onOpenDetail={onOpenDetail}
      />
      {photosRow ? (
        <MobileLinePhotoViewer
          subject={{
            skuCatalogId: null,
            sku: photosRow.sku ?? null,
            itemNumber: photosRow.itemNumber ?? null,
            catalogImageUrl: photosRow.imageUrl ?? null,
          }}
          onClose={closePhotos}
        />
      ) : null}
      <MobileToShipSheet
        row={sheetRow}
        open={sheetRow != null}
        onClose={() => setSheetRow(null)}
        onOpenDetail={onOpenDetail}
        resolveName={getStaffName}
      />
      <MobileToShipPickerSheet
        currentPickerId={passPickRow?.techId ?? null}
        open={passPickRow != null}
        onClose={() => setPassPickRow(null)}
        onPass={(staff) => {
          if (!passPickRow) return;
          assignOrder(
            {
              orderId: passPickRow.entityId,
              testerId: staff.id,
              testerName: staff.name,
            },
            { onSuccess: () => setPassPickRow(null) },
          );
        }}
      />
    </div>
  );
}
