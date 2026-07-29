'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from '@/components/Icons';
import { FnskuChip, CopyChip, getLast4 } from '@/components/ui/CopyChip';
import { PrintTableCheckbox } from '@/components/fba/table/Checkbox';
import { sectionLabel, SkeletonList } from '@/design-system';
import { LedgerGrid } from '@/design-system/components/grid';
import { IconButton, Button } from '@/design-system/primitives';
import type { StationTheme } from '@/utils/staff-colors';
import { printQueueTableUi } from '@/utils/staff-colors';
import { cn } from '@/utils/_cn';
import { formatDateKeyShort } from '@/utils/date';
import type { FbaBoardStatusFilter } from '@/lib/fba/fba-metrics';

import type { FbaBoardItem } from '@/lib/fba/types';
export type { FbaBoardItem } from '@/lib/fba/types';
import {
  FBA_STATUS_LABEL,
  FBA_STATUS_ORDER,
  fbaStatusPillClass,
} from '@/lib/fba/status';
import {
  FBA_BOARD_SELECTION,
  FBA_BOARD_SELECTION_COUNT,
  FBA_BOARD_TOGGLE_ALL,
  FBA_BOARD_SELECT_BY_DAY,
  FBA_BOARD_DESELECT_BY_DAY,
  FBA_BOARD_DESELECT_ITEM,
  FBA_BOARD_SELECT_BY_FNSKU,
  FBA_BOARD_FNSKU_SELECT_RESULT,
} from '@/lib/fba/events';

const FBA_GRID =
  'grid grid-cols-[2.5rem_5.5rem_minmax(12rem,1.4fr)_6.5rem_4.5rem_5.5rem_5rem_4rem_minmax(5rem,1fr)_2.5rem] items-center gap-x-1';

interface FbaBoardTableProps {
  items: FbaBoardItem[];
  loading?: boolean;
  stationTheme?: StationTheme;
  emptyMessage?: string;
  onSelectionChange?: (selected: FbaBoardItem[]) => void;
  onDetailOpen?: (item: FbaBoardItem) => void;
  /** Status facet from the KPI strip (`ALL` = no filter). Owned by the workspace. */
  statusFilter?: FbaBoardStatusFilter;
  /** Text filter from the chrome search field. Owned by the workspace. */
  query?: string;
  /** Clear filters affordance for the filtered-empty state. */
  onResetFilters?: () => void;
  /** Extra classes on the table wrapper (e.g. pb for floating combine pill). */
  contentClassName?: string;
}

function sortBoardItems(a: FbaBoardItem, b: FbaBoardItem) {
  const aOrder = FBA_STATUS_ORDER[a.item_status.toUpperCase()] ?? 99;
  const bOrder = FBA_STATUS_ORDER[b.item_status.toUpperCase()] ?? 99;
  if (aOrder !== bOrder) return aOrder - bOrder;

  const fa = a.fnsku.toUpperCase();
  const fb = b.fnsku.toUpperCase();
  if (fa !== fb) return fa.localeCompare(fb);

  return a.item_id - b.item_id;
}

export function FbaBoardTable({
  items,
  loading = false,
  stationTheme = 'green',
  emptyMessage,
  onSelectionChange,
  onDetailOpen,
  statusFilter = 'ALL',
  query = '',
  onResetFilters,
  contentClassName,
}: FbaBoardTableProps) {
  const ui = printQueueTableUi[stationTheme];

  const sortedItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...items]
      .filter((item) => {
        if (statusFilter !== 'ALL' && item.item_status.toUpperCase() !== statusFilter) return false;
        if (!q) return true;
        const hay = [item.display_title, item.fnsku, item.asin, item.sku, item.shipment_ref]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort(sortBoardItems);
  }, [items, statusFilter, query]);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  /** Index in `sortedItems` for the last plain click — shift-click selects the inclusive range from here. */
  const anchorIndexRef = useRef<number | null>(null);
  /**
   * Mirror of `selectedIds` so window-event handlers (and the pruning effect) can read the
   * latest set without re-subscribing — and so we never call `emitSelection` from inside a
   * `setSelectedIds` updater, which runs during render and would trigger a setState in the
   * listening components (StationFbaInput / FbaSidebar) mid-render.
   */
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const emitSelection = useCallback(
    (nextIds: Set<number>) => {
      onSelectionChange?.(sortedItems.filter((i) => nextIds.has(i.item_id)));
      window.dispatchEvent(
        new CustomEvent(FBA_BOARD_SELECTION, {
          detail: sortedItems.filter((i) => nextIds.has(i.item_id)),
        }),
      );
    },
    [sortedItems, onSelectionChange],
  );

  useEffect(() => {
    // Keep checkbox state aligned with the current table slice (filters/week changes).
    const prev = selectedIdsRef.current;
    if (prev.size === 0) return;
    const visibleIds = new Set(sortedItems.map((item) => item.item_id));
    const next = new Set<number>();
    for (const id of prev) {
      if (visibleIds.has(id)) next.add(id);
    }
    if (next.size === prev.size) return;
    setSelectedIds(next);
    emitSelection(next);
  }, [sortedItems, emitSelection]);

  useEffect(() => {
    // Defer dispatch to avoid setState-during-render in listening components (FbaSidebar)
    const id = requestAnimationFrame(() => {
      const qtyOrOne = (i: FbaBoardItem) => Math.max(1, Number(i.actual_qty || 0));
      const selectedQty = sortedItems
        .filter((i) => selectedIds.has(i.item_id))
        .reduce((sum, i) => sum + qtyOrOne(i), 0);
      const totalQty = sortedItems.reduce((sum, i) => sum + qtyOrOne(i), 0);
      window.dispatchEvent(
        new CustomEvent(FBA_BOARD_SELECTION_COUNT, {
          detail: {
            selected: sortedItems.filter((i) => selectedIds.has(i.item_id)).length,
            total: sortedItems.length,
            selectedQty,
            totalQty,
          },
        }),
      );
    });
    return () => cancelAnimationFrame(id);
  }, [selectedIds, sortedItems]);

  useEffect(() => {
    if (anchorIndexRef.current !== null && anchorIndexRef.current >= sortedItems.length) {
      anchorIndexRef.current = null;
    }
  }, [sortedItems.length]);

  const toggleItem = useCallback(
    (id: number) => {
      const next = new Set(selectedIdsRef.current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
      emitSelection(next);
    },
    [emitSelection],
  );

  const selectRangeInclusive = useCallback(
    (fromIndex: number, toIndex: number) => {
      const lo = Math.min(fromIndex, toIndex);
      const hi = Math.max(fromIndex, toIndex);
      const next = new Set<number>();
      for (let i = lo; i <= hi; i++) {
        const row = sortedItems[i];
        if (row) next.add(row.item_id);
      }
      setSelectedIds(next);
      emitSelection(next);
    },
    [sortedItems, emitSelection],
  );

  const handleRowActivate = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent, index: number, item: FbaBoardItem) => {
      const shiftKey = 'shiftKey' in event && event.shiftKey;
      if (shiftKey && anchorIndexRef.current !== null) {
        event.preventDefault();
        selectRangeInclusive(anchorIndexRef.current, index);
        return;
      }
      toggleItem(item.item_id);
      anchorIndexRef.current = index;
    },
    [selectRangeInclusive, toggleItem],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent<'all' | 'none'>).detail;
      if (action === 'all') {
        const next = new Set(sortedItems.map((i) => i.item_id));
        setSelectedIds(next);
        emitSelection(next);
        anchorIndexRef.current = null;
      } else {
        setSelectedIds(new Set());
        emitSelection(new Set());
        anchorIndexRef.current = null;
      }
    };
    window.addEventListener(FBA_BOARD_TOGGLE_ALL, handler);

    // Select all items for a specific plan day (due_date)
    const selectByDayHandler = (e: Event) => {
      const dueDate = (e as CustomEvent<string>).detail;
      const dayItems = sortedItems.filter((i) => {
        const itemDay = i.due_date ? String(i.due_date).slice(0, 10) : '';
        return itemDay === dueDate;
      });
      if (dayItems.length === 0) return;
      const next = new Set(selectedIdsRef.current);
      for (const i of dayItems) next.add(i.item_id);
      setSelectedIds(next);
      emitSelection(next);
    };
    window.addEventListener(FBA_BOARD_SELECT_BY_DAY, selectByDayHandler);

    const deselectByDayHandler = (e: Event) => {
      const dueDate = (e as CustomEvent<string>).detail;
      const next = new Set(selectedIdsRef.current);
      for (const i of sortedItems) {
        const itemDay = i.due_date ? String(i.due_date).slice(0, 10) : '';
        if (itemDay === dueDate) next.delete(i.item_id);
      }
      setSelectedIds(next);
      emitSelection(next);
    };
    window.addEventListener(FBA_BOARD_DESELECT_BY_DAY, deselectByDayHandler);

    const deselectHandler = (e: Event) => {
      const itemId = (e as CustomEvent<number>).detail;
      const next = new Set(selectedIdsRef.current);
      next.delete(itemId);
      setSelectedIds(next);
      emitSelection(next);
    };
    window.addEventListener(FBA_BOARD_DESELECT_ITEM, deselectHandler);

    const selectByFnskuHandler = (e: Event) => {
      // Accept either a raw fnsku string or a { fnsku } payload — never let an
      // object coerce to the literal "[object Object]".
      const raw = (e as CustomEvent<unknown>).detail;
      const value =
        typeof raw === 'string'
          ? raw
          : raw && typeof raw === 'object'
            ? String((raw as { fnsku?: unknown }).fnsku ?? '')
            : '';
      const fnsku = value.toUpperCase();
      if (!fnsku) return;
      // Match by FNSKU or ASIN — a B0 ASIN scan should select items that have that ASIN.
      const matching = sortedItems.filter(
        (i) => i.fnsku.toUpperCase() === fnsku || (i.asin && i.asin.toUpperCase() === fnsku),
      );
      if (matching.length === 0) {
        window.dispatchEvent(
          new CustomEvent(FBA_BOARD_FNSKU_SELECT_RESULT, {
            detail: { fnsku, found: false, count: 0 },
          }),
        );
        return;
      }
      const next = new Set(selectedIdsRef.current);
      for (const i of matching) next.add(i.item_id);
      setSelectedIds(next);
      emitSelection(next);
      window.dispatchEvent(
        new CustomEvent(FBA_BOARD_FNSKU_SELECT_RESULT, {
          detail: { fnsku, found: true, count: matching.length, title: matching[0].display_title },
        }),
      );
    };
    window.addEventListener(FBA_BOARD_SELECT_BY_FNSKU, selectByFnskuHandler);

    return () => {
      window.removeEventListener(FBA_BOARD_TOGGLE_ALL, handler);
      window.removeEventListener(FBA_BOARD_DESELECT_ITEM, deselectHandler);
      window.removeEventListener(FBA_BOARD_SELECT_BY_DAY, selectByDayHandler);
      window.removeEventListener(FBA_BOARD_DESELECT_BY_DAY, deselectByDayHandler);
      window.removeEventListener(FBA_BOARD_SELECT_BY_FNSKU, selectByFnskuHandler);
    };
  }, [sortedItems, emitSelection]);

  if (loading) {
    return (
      <div className={cn('flex min-w-0 flex-col py-2', contentClassName)}>
        <SkeletonList count={12} />
      </div>
    );
  }

  if (sortedItems.length === 0) {
    return (
      <div className={cn('flex min-w-0 flex-col items-center justify-center px-6 py-16 text-center', contentClassName)}>
        <div className="max-w-sm space-y-2">
          <p className={sectionLabel}>{emptyMessage || 'No items'}</p>
          {(statusFilter !== 'ALL' || query.trim()) && onResetFilters ? (
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2.5 text-role-micro uppercase tracking-widest"
              onClick={onResetFilters}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  // Full-bleed LedgerGrid SoT — sticky header + day bands by due date.
  const daySections = useMemo<[string, FbaBoardItem[]][]>(() => {
    const byDay: Record<string, FbaBoardItem[]> = {};
    for (const item of sortedItems) {
      const key = item.due_date ? String(item.due_date).slice(0, 10) : 'No due date';
      (byDay[key] ??= []).push(item);
    }
    return Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sortedItems]);

  const flatIndexById = useMemo(() => {
    const map = new Map<number, number>();
    sortedItems.forEach((item, index) => map.set(item.item_id, index));
    return map;
  }, [sortedItems]);

  return (
    <div className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', contentClassName)}>
      <LedgerGrid<FbaBoardItem>
        daySections={daySections}
        showDayHeaders
        scrollX
        gridSkin="airtable"
        aria-label="FBA shipment board"
        columnHeader={
          <div
            className={cn(
              FBA_GRID,
              'border-b border-border-soft bg-surface-card px-3 py-3 text-left text-role-micro uppercase tracking-widest text-text-soft',
            )}
          >
            <span className="sr-only">Select</span>
            <span>ASIN</span>
            <span>Title</span>
            <span>FNSKU</span>
            <span>Qty</span>
            <span>Status</span>
            <span>Condition</span>
            <span>Due</span>
            <span>Plan</span>
            <span className="sr-only">Details</span>
          </div>
        }
        getRowKey={(item) => String(item.item_id)}
        emptyState={<p className={sectionLabel}>{emptyMessage || 'No items'}</p>}
        renderRow={(item) => {
          const index = flatIndexById.get(item.item_id) ?? 0;
          const isSelected = selectedIds.has(item.item_id);
          const due = item.due_date ? formatDateKeyShort(String(item.due_date).slice(0, 10)) : '—';
          const planRef = item.shipment_ref || item.amazon_shipment_id || '';
          return (
            <div
              key={item.item_id}
              role="button"
              tabIndex={0}
              onClick={(e) => handleRowActivate(e, index, item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleRowActivate(e, index, item);
                }
              }}
              className={cn(
                FBA_GRID,
                'cursor-pointer border-b border-border-hairline px-3 py-3 transition-colors',
                ui.rowFocusRing,
                isSelected ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'bg-surface-card hover:bg-gray-50',
              )}
            >
              <div className="align-middle">
                <PrintTableCheckbox
                  checked={isSelected}
                  onChange={() => toggleItem(item.item_id)}
                  onClick={(e) => handleRowActivate(e, index, item)}
                  stationTheme={stationTheme}
                  label={`${isSelected ? 'Deselect' : 'Select'} ${item.fnsku}`}
                />
              </div>
              <div className="min-w-0 align-middle">
                {item.asin ? (
                  <CopyChip value={item.asin} display={getLast4(item.asin)} tone="id" dense />
                ) : (
                  <span className="text-role-caption text-text-faint">—</span>
                )}
              </div>
              <div className="min-w-0 align-middle">
                <p className="truncate text-role-caption font-semibold text-gray-900">
                  {item.display_title || '—'}
                </p>
                {item.sku ? (
                  <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-gray-500">
                    {item.sku}
                  </p>
                ) : null}
              </div>
              <div className="align-middle">
                <FnskuChip value={item.fnsku} />
              </div>
              <div className="align-middle">
                <span className="tabular-nums text-role-caption font-semibold text-text-default">
                  {item.actual_qty}
                  <span className="text-text-faint"> / </span>
                  {item.expected_qty}
                </span>
              </div>
              <div className="align-middle">
                <StatusPill status={item.item_status} />
              </div>
              <div className="align-middle text-role-caption font-semibold text-text-soft">
                {item.condition || '—'}
              </div>
              <div className="align-middle text-role-caption tabular-nums text-text-soft">{due}</div>
              <div className="min-w-0 align-middle">
                {planRef ? (
                  <div className="flex flex-col gap-0.5">
                    <CopyChip value={planRef} display={getLast4(planRef)} tone="id" dense />
                    {item.destination_fc ? (
                      <p className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
                        {item.destination_fc}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-role-caption text-text-faint">—</span>
                )}
              </div>
              <div className="align-middle">
                {onDetailOpen ? (
                  <IconButton
                    type="button"
                    icon={<ChevronRight className="h-3.5 w-3.5" />}
                    ariaLabel={`Details for ${item.fnsku}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDetailOpen(item);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-text-faint hover:bg-surface-sunken hover:text-text-muted"
                  />
                ) : null}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const color = fbaStatusPillClass(status);
  const label = FBA_STATUS_LABEL[s] ?? s.replace(/_/g, ' ');

  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-role-eyebrow uppercase tracking-wider',
        color,
      )}
    >
      {label}
    </span>
  );
}
