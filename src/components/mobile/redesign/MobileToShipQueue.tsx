'use client';

/**
 * Phone to-ship queue — `/m/work`.
 *
 * Compact All / Assigned / Unassigned pills, inline SearchField, sort
 * (including Title A–Z). White floor; raised white cards. Condition is the
 * slot-table subtitle face. Out of stock writes through useOrderAssignment.
 */

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown } from '@/components/Icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  IconButton,
  Inset,
  SearchField,
} from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
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
import { useToShipOrders } from '@/components/mobile/redesign/useToShipOrders';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import type { WorkOrderRow } from '@/components/work-orders/types';

export function MobileToShipQueue() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseMobileToShipTab(searchParams.get('tab'));
  const sort = parseMobileToShipSort(searchParams.get('sort'));
  const searchQuery = searchParams.get('q') ?? '';
  const { rows, isPending, isError, isFetching } = useToShipOrders({
    enabled: true,
    searchQuery,
  });
  const { getStaffName } = useStaffNameMap();
  const { mutate: assignOrder } = useOrderAssignment();
  const [sheetRow, setSheetRow] = useState<WorkOrderRow | null>(null);
  const [oosIds, setOosIds] = useState<ReadonlySet<number>>(() => new Set());

  const groups = useMemo(() => {
    const working = rows.filter(
      (row) => !isToShipOutOfStock(row) && !oosIds.has(row.entityId),
    );
    const filtered = sortToShipRows(
      filterToShipByQuery(filterToShipByTab(working, tab), searchQuery),
      sort,
      getStaffName,
    );
    if (sort !== 'deadline') {
      return filtered.length > 0 ? [{ band: 'none' as const, label: '', rows: filtered }] : [];
    }
    return bandWorkOrderRows(filtered);
  }, [getStaffName, oosIds, rows, searchQuery, sort, tab]);

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
      router.push(mobileProcessOrderHref(row));
    },
    [router],
  );

  const onOutOfStock = useCallback(
    (row: WorkOrderRow) => {
      setOosIds((current) => {
        if (current.has(row.entityId)) return current;
        const next = new Set(current);
        next.add(row.entityId);
        return next;
      });
      assignOrder(
        { orderId: row.entityId, isOutOfStock: true },
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

  const sortLabel = MOBILE_TO_SHIP_SORTS.find((option) => option.id === sort)?.label ?? 'Ship by';

  return (
    <div data-testid="to-ship-queue" className="flex h-full min-h-full flex-col bg-surface-card">
      <div className="bg-surface-card">
        <Inset space="chip">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label="Order assignment"
                data-testid="to-ship-tablist"
                className="flex min-w-0 flex-wrap items-center gap-1"
              >
                {MOBILE_TO_SHIP_TABS.map((option) => {
                  const selected = option.id === tab;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => replaceParams({ tab: option.id })}
                      className={cn(
                        'ds-raw-button px-2 py-0.5 text-role-eyebrow font-semibold',
                        cornerClass('surface'),
                        selected
                          ? 'bg-surface-sunken text-text-default ring-1 ring-border-soft'
                          : 'text-text-soft',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    size="xs"
                    radius="surface"
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
            <div data-testid="to-ship-search">
              <SearchField
                value={searchQuery}
                onChange={(value) => replaceParams({ q: value })}
                placeholder="Search order"
                tone="neutral"
                hideUnderline
                isSearching={isFetching && Boolean(searchQuery.trim())}
              />
            </div>
          </div>
        </Inset>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-card">
        <Inset space="chip">
          {isPending ? (
            <p className="text-role-eyebrow text-text-muted">Loading…</p>
          ) : isError ? (
            <p className="text-role-eyebrow text-text-muted">Couldn&apos;t load orders.</p>
          ) : groups.length === 0 ? (
            <p className="text-role-eyebrow text-text-muted">
              {searchQuery.trim() ? 'No matching orders.' : 'No orders in this view.'}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <section key={group.band + group.label}>
                  {group.label ? (
                    <h2 className="mb-1 px-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
                      {group.label}
                    </h2>
                  ) : null}
                  <ul className="flex flex-col gap-3">
                    {group.rows.map((row) => (
                      <li key={row.id}>
                        <MobileToShipRow
                          row={row}
                          resolveName={getStaffName}
                          onOpen={setSheetRow}
                          onProcess={onProcess}
                          onOutOfStock={onOutOfStock}
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
        resolveName={getStaffName}
      />
    </div>
  );
}
