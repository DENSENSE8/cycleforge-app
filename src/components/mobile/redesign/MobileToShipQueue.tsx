'use client';

/**
 * Phone to-ship queue — `/m/work`.
 *
 * Compact All / Assigned / Unassigned pills, inline SearchField, sort
 * (including Title A–Z). White floor; raised white cards. Product thumb,
 * qty, and condition use the existing item-record / grade faces. Out of
 * stock writes through useOrderAssignment and disables Ship.
 */

import { useCallback, useMemo, useState } from 'react';
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
  filterToShipByQuery,
  filterToShipByTab,
  isToShipOutOfStock,
  mobileProcessOrderHref,
  parseMobileToShipSort,
  parseMobileToShipTab,
  sortToShipRows,
  type MobileToShipSort,
  type MobileToShipTab,
} from '@/lib/work-orders/to-ship-assignment';
import { MobileToShipRow } from '@/components/mobile/redesign/MobileToShipRow';
import { MobileToShipSheet } from '@/components/mobile/redesign/MobileToShipSheet';
import { useToShipOrders, type MobileToShipFeed } from '@/components/mobile/redesign/useToShipOrders';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import type { WorkOrderRow } from '@/components/work-orders/types';
import type { OrderShortageIdentity } from '@/lib/orders/order-shortage-identity';
import { useAuth } from '@/contexts/AuthContext';

/** Phone order import — its own screen, with its own X (see MobileOrderSyncScreen). */
const ORDER_SYNC_HREF = '/m/orders/sync';

export function MobileToShipQueue({ feed = 'unshipped' }: { feed?: MobileToShipFeed } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseMobileToShipTab(searchParams.get('tab'));
  const sort = parseMobileToShipSort(searchParams.get('sort'));
  const searchQuery = searchParams.get('q') ?? '';
  const { rows, isPending, isError, isFetching } = useToShipOrders({
    enabled: true,
    searchQuery,
    feed,
  });
  const { getStaffName } = useStaffNameMap();
  const { mutate: assignOrder } = useOrderAssignment();
  const [sheetRow, setSheetRow] = useState<WorkOrderRow | null>(null);
  const [oosIds, setOosIds] = useState<ReadonlySet<number>>(() => new Set());

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

  const groups = useMemo(() => {
    const filtered = sortToShipRows(
      filterToShipByQuery(filterToShipByTab(rows, activeTab), searchQuery, getStaffName),
      sort,
      getStaffName,
    );
    if (sort !== 'deadline') {
      return filtered.length > 0 ? [{ band: 'none' as const, label: '', rows: filtered }] : [];
    }
    return bandWorkOrderRows(filtered);
  }, [activeTab, getStaffName, rows, searchQuery, sort]);

  const replaceParams = useCallback(
    (patch: { tab?: MobileToShipTab; sort?: MobileToShipSort; q?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (patch.tab) params.set('tab', patch.tab);
      if (patch.sort) params.set('sort', patch.sort);
      if (patch.q !== undefined) {
        const next = patch.q.trim();
        if (next) params.set('q', next);
        else params.delete('q');
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const onProcess = useCallback(
    (row: WorkOrderRow) => {
      if (oosIds.has(row.entityId) || isToShipOutOfStock(row)) return;
      router.push(mobileProcessOrderHref(row));
    },
    [oosIds, router],
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

  const onOpenDetail = useCallback(
    (row: WorkOrderRow) => {
      setSheetRow(null);
      router.push(row.sourcePath || `/m/orders/${encodeURIComponent(String(row.orderId || row.entityId))}`);
    },
    [router],
  );

  const onPassPicker = useCallback(
    (row: WorkOrderRow, staff: { id: number; name: string }) => {
      assignOrder({
        orderId: row.entityId,
        testerId: staff.id,
        testerName: staff.name,
      });
      setSheetRow((current) =>
        current?.id === row.id
          ? { ...current, techId: staff.id, techName: staff.name, status: 'ASSIGNED' }
          : current,
      );
    },
    [assignOrder],
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
  const showImportSync = feed === 'unshipped' && has('orders.import');

  const sortLabel = MOBILE_TO_SHIP_SORTS.find((option) => option.id === sort)?.label ?? 'Ship by';

  return (
    <div data-testid="to-ship-queue" className="flex h-full min-h-full flex-col bg-surface-card">
      <div className="bg-surface-card">
        <Inset space="chip">
          <div className="flex flex-col gap-1.5">
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
                          'ds-raw-button rounded-full px-2 py-0.5 text-role-caption font-semibold',
                          selected
                            ? 'bg-text-default text-surface-card'
                            : 'text-text-muted',
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
                  <IconButton
                    size="xs"
                    radius="pill"
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
          </div>
        </Inset>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-card">
        <Inset space="chip">
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
            <div className="mb-3 flex items-center justify-between gap-3">
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
            <p className="text-role-caption text-text-muted">Loading…</p>
          ) : isError ? (
            <p className="text-role-caption text-text-muted">Couldn&apos;t load orders.</p>
          ) : groups.length === 0 ? (
            <p className="text-role-caption text-text-muted">
              {searchQuery.trim() ? 'No matching orders.' : 'No orders in this view.'}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <section key={group.band + group.label}>
                  {group.label ? (
                    <h2 className="mb-1.5 px-1 text-role-eyebrow font-semibold uppercase tracking-widest text-amber-700">
                      {group.label}
                    </h2>
                  ) : null}
                  <ul className="flex flex-col gap-2">
                    {group.rows.map((row) => (
                      <li key={row.id}>
                        <MobileToShipRow
                          row={row}
                          resolveName={getStaffName}
                          blocked={oosIds.has(row.entityId) || isToShipOutOfStock(row)}
                          onOpen={setSheetRow}
                          onProcess={onProcess}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Inset>
      </div>

      <MobileToShipSheet
        row={sheetRow}
        open={sheetRow != null}
        onClose={() => setSheetRow(null)}
        onProcess={onProcess}
        onOutOfStock={onOutOfStock}
        onOpenDetail={onOpenDetail}
        onPassPicker={onPassPicker}
        blocked={sheetRow != null && (oosIds.has(sheetRow.entityId) || isToShipOutOfStock(sheetRow))}
        resolveName={getStaffName}
      />
    </div>
  );
}
