'use client';

/**
 * Phone to-ship queue — canonical `/m/orders`; `/m/work` is a compatibility
 * alias.
 *
 * Compact All / Assigned / Unassigned pills, inline SearchField, sort
 * (including Title A–Z). White floor; raised white cards. Product thumb,
 * qty, and condition use the existing item-record / grade faces. Out of
 * stock writes through useOrderAssignment and disables Ship.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown, RefreshCw } from '@/components/Icons';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  IconButton,
  Inset,
  SearchField,
} from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
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
    (patch: { tab?: MobileToShipTab; view?: typeof orderView; sort?: MobileToShipSort; q?: string; platform?: string }) => {
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
      router.push(row.sourcePath || `/m/orders/${encodeURIComponent(String(row.orderId || row.entityId))}`);
    },
    [router],
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
   * completable on `/m` first). The desk's Sync CTA had no counterpart here at
   * all, so a floor operator could read the queue but never refill it.
   *
   * ## NO NEW BAR. It is a row in the content.
   *
   * Three homes were tried and rejected by the operator on 2026-09-15, each one
   * a smaller version of the same mistake — inventing chrome for one verb:
   *
   * 1. A 28px icon button in the middle of the tab row — *"a tiny sync button
   *    in the middle top is a terrible display"*.
   * 2. The shell's `MobileActionSlot` seat beside Scan — *"it should not
   *    display in the top header"*. That bar belongs to the app (menu, title,
   *    Scan), not to one page's verb.
   * 3. Its own bordered strip between the header and the list — *"it should not
   *    display in another bar … it should just display not sticky but at the
   *    top"*. A second non-scrolling band under the host header is the kiosk
   *    double-band bug ({@link KioskPaneForm}: a pane that can paint its own
   *    chrome while the shell paints one WILL stack two), and SURFACE_LAW §5-§6
   *    allows one sticky CTA per use case — this screen's is Ship, on the row.
   *
   * What shipped: the first row INSIDE the scroll body. No border, no surface
   * layer of its own, not sticky — it scrolls away like any content.
   *
   * OUTBOUND ORDERS ONLY. This component is also `/m/pick` (`feed="pending"`),
   * a picking queue that imports nothing, so it is gated on the feed as well as
   * the permission.
   */
  const { has } = useAuth();
  const showImportSync = allowImportSync && feed === 'unshipped' && has('orders.import');

  const sortLabel = MOBILE_TO_SHIP_SORTS.find((option) => option.id === sort)?.label ?? 'Ship by';

  return (
    <div data-testid="to-ship-queue" className="flex h-full min-h-full flex-col bg-surface-card">
      <div className="bg-surface-card">
        <Inset space="chip">
          <div className="flex flex-col gap-1.5">
            <div
              role="tablist"
              aria-label="Order views"
              data-testid="mobile-order-view-tabs"
              className="-mx-3 flex min-w-0 overflow-x-auto border-b border-border-hairline px-3"
            >
              {MOBILE_ORDER_VIEWS.map((option) => {
                const selected = option.id === orderView;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    data-testid={`mobile-order-view-${option.id}`}
                    onClick={() => replaceParams({ view: option.id })}
                    className={cn(
                      'ds-raw-button min-h-11 shrink-0 border-b-2 px-3 text-role-caption font-semibold',
                      selected
                        ? 'border-text-accent text-text-default'
                        : 'border-transparent text-text-muted',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {/* Tabs own their row. Search + sort share the next ONE — the
                sort control rides the search field's right edge (operator
                2026-09-15: "close the search bar row and the sort row under
                one row"), so the chrome is two lines, not three. */}
            <div className="flex items-center justify-between gap-2">
              {showAssignmentTabs ? (
                <div
                  role="tablist"
                  aria-label="Pick assignment"
                  data-testid="to-ship-tablist"
                  className="flex min-w-0 flex-wrap items-center gap-2"
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
                        className={cn(
                          'ds-raw-button border-b-2 px-2 py-1 text-role-caption font-semibold',
                          selected
                            ? 'border-text-accent text-text-default'
                            : 'border-transparent text-text-muted',
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="min-w-0 flex-1" />
              )}
            </div>
            {orderView !== 'exceptions' ? (
            <div data-testid="to-ship-search" className="flex items-center gap-1">
              <SearchField
                value={searchQuery}
                onChange={(value) => replaceParams({ q: value })}
                placeholder="Search product, SKU, item…"
                tone="neutral"
                hideUnderline
                isSearching={isFetching && Boolean(searchQuery.trim())}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    radius="flush"
                    data-testid="to-ship-platform-filter"
                    aria-label={`Platform filter, ${platform === 'all' ? 'All platforms' : platform}`}
                    className="shrink-0 whitespace-nowrap"
                  >
                    {platform === 'all' ? 'Platforms' : platform}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
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
                  <IconButton
                    size="xs"
                    radius="flush"
                    ariaLabel={`Sort, ${sortLabel}`}
                    data-testid="to-ship-sort"
                    icon={<ArrowUpDown className="h-3.5 w-3.5" />}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
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
            </div>
            ) : null}
          </div>
        </Inset>
      </div>

      {orderView === 'exceptions' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <MobileOrderExceptions />
        </div>
      ) : (
      <div data-testid="to-ship-roster" className="min-h-0 flex-1 overflow-y-auto bg-surface-card">
        <div>
          {/*
            Sync sits IN the content, at the top, and scrolls away with it.
            NOT a bar: no border, no own surface layer, not sticky (operator
            2026-09-15 — *"it should not display in another bar … it should just
            display not sticky but at the top"*). The shell already paints the
            one bar this screen gets; a second strip under it is the kiosk
            double-band bug wearing different clothes, and `MobileActionSlot`
            was the same error one altitude up.
          */}
          {showImportSync ? (
            <div className="mb-3 flex items-center justify-between gap-3 px-3">
              <p className="min-w-0 text-role-caption text-text-muted">
                {isPending ? 'Loading orders…' : `${rows.length} in the warehouse`}
              </p>
              <Button
                variant="primary"
                size="sm"
                className="shrink-0"
                onClick={() => router.push(ORDER_SYNC_HREF)}
                data-testid="to-ship-sync"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Sync orders
              </Button>
            </div>
          ) : null}
          {isPending ? (
            <p className="px-3 text-role-caption text-text-muted">Loading…</p>
          ) : isError ? (
            <p className="px-3 text-role-caption text-text-muted">Couldn&apos;t load orders.</p>
          ) : groups.length === 0 ? (
            <p className="px-3 text-role-caption text-text-muted">
              {searchQuery.trim() ? 'No matching orders.' : 'No orders in this view.'}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <section key={group.band + group.label}>
                  {group.label ? (
                    <h2 className="mb-1.5 px-3 text-role-eyebrow font-semibold uppercase tracking-widest text-text-warning">
                      {group.label}
                    </h2>
                  ) : null}
                  <ul className="flex flex-col">
                    {group.rows.map((row) => (
                      <li key={row.id}>
                        <MobileToShipRow
                          row={row}
                          resolveName={getStaffName}
                          blocked={oosIds.has(row.entityId) || isToShipOutOfStock(row)}
                          onOpen={setActiveRow}
                          onOpenSheet={setSheetRow}
                          onPassPick={setPassPickRow}
                          onPriorityAction={onPriorityAction}
                          onTriage={onRowTriage}
                          onHold={onRowHold}
                          now={now}
                          active={activeRow?.id === row.id}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      <MobileToShipSheet
        row={sheetRow}
        open={sheetRow != null}
        onClose={() => setSheetRow(null)}
        onOpenDetail={onOpenDetail}
        resolveName={getStaffName}
      />
      <MobileToShipPickerSheet
        row={passPickRow}
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
