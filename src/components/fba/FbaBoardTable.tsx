'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from '@/components/Icons';
import { FnskuChip, CopyChip, getLast4 } from '@/components/ui/CopyChip';
import { PrintTableCheckbox } from '@/components/fba/table/Checkbox';
import { sectionLabel, SkeletonList } from '@/design-system';
import { IconButton, Button } from '@/design-system/primitives';
import { DateRangePickerPill } from '@/components/ui/DateRangeHeader';
import { PaneHeaderTabs } from '@/components/ui/pane-header';
import { KpiTile } from '@/design-system/components/monitor';
import type { StationTheme } from '@/utils/staff-colors';
import { printQueueTableUi } from '@/utils/staff-colors';
import { cn } from '@/utils/_cn';
import { formatDateKeyShort, formatWeekRangeCompact } from '@/utils/date';

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

interface FbaBoardTableProps {
  items: FbaBoardItem[];
  loading?: boolean;
  stationTheme?: StationTheme;
  emptyMessage?: string;
  onSelectionChange?: (selected: FbaBoardItem[]) => void;
  onDetailOpen?: (item: FbaBoardItem) => void;
  weekRange?: { startStr: string; endStr: string };
  weekOffset?: number;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  rightSlot?: ReactNode;
  /** Extra classes on the scroll body (e.g. pb for floating combine pill). */
  contentClassName?: string;
}

type BoardStatusFilter =
  | 'ALL'
  | 'PLANNED'
  | 'TESTED'
  | 'PACKED'
  | 'LABEL_ASSIGNED'
  | 'OUT_OF_STOCK';

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
  weekRange,
  weekOffset = 0,
  onPrevWeek,
  onNextWeek,
  rightSlot,
  contentClassName,
}: FbaBoardTableProps) {
  const ui = printQueueTableUi[stationTheme];

  const [statusFilter, setStatusFilter] = useState<BoardStatusFilter>('ALL');
  const [query, setQuery] = useState('');

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

  const statusCounts = useMemo(() => {
    const counts: Record<Exclude<BoardStatusFilter, 'ALL'>, number> = {
      PLANNED: 0,
      TESTED: 0,
      PACKED: 0,
      LABEL_ASSIGNED: 0,
      OUT_OF_STOCK: 0,
    };
    let units = 0;
    for (const item of items) {
      const s = item.item_status.toUpperCase() as keyof typeof counts;
      if (s in counts) counts[s] += 1;
      units += Math.max(0, Number(item.actual_qty) || 0);
    }
    return { ...counts, units, lines: items.length };
  }, [items]);

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

  const allVisibleSelected =
    sortedItems.length > 0 && sortedItems.every((i) => selectedIds.has(i.item_id));
  const someSelected = selectedIds.size > 0;

  const weekPillLabel =
    weekRange != null
      ? formatWeekRangeCompact(weekRange.startStr, weekRange.endStr)
      : 'All dates';

  const filterTabs: { value: BoardStatusFilter; label: string; count: number }[] = [
    { value: 'ALL', label: 'All', count: statusCounts.lines },
    { value: 'PLANNED', label: 'Planned', count: statusCounts.PLANNED },
    { value: 'TESTED', label: 'Tested', count: statusCounts.TESTED },
    { value: 'PACKED', label: 'Packed', count: statusCounts.PACKED },
    { value: 'LABEL_ASSIGNED', label: 'Combined', count: statusCounts.LABEL_ASSIGNED },
    { value: 'OUT_OF_STOCK', label: 'OOS', count: statusCounts.OUT_OF_STOCK },
  ];

  const toolbar = (
    <div className="flex min-w-0 shrink-0 flex-col gap-4 border-b border-border-soft bg-surface-card/95 px-4 py-4 sm:px-6 lg:px-8">
      {/* KPI strip — Monitor tiles, clickable → status tab */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Lines"
          value={statusCounts.lines}
          onOpen={() => setStatusFilter('ALL')}
          className="p-3"
        />
        <KpiTile
          label="Units"
          value={statusCounts.units}
          valueClassName="text-text-fulfillment"
          className="p-3"
        />
        <KpiTile
          label="Planned"
          value={statusCounts.PLANNED}
          valueClassName="text-amber-700"
          onOpen={() => setStatusFilter('PLANNED')}
          className="p-3"
        />
        <KpiTile
          label="Tested"
          value={statusCounts.TESTED}
          valueClassName="text-emerald-700"
          onOpen={() => setStatusFilter('TESTED')}
          className="p-3"
        />
        <KpiTile
          label="Packed"
          value={statusCounts.PACKED}
          valueClassName="text-blue-700"
          onOpen={() => setStatusFilter('PACKED')}
          className="p-3"
        />
        <KpiTile
          label="Combined"
          value={statusCounts.LABEL_ASSIGNED}
          valueClassName="text-green-700"
          onOpen={() => setStatusFilter('LABEL_ASSIGNED')}
          className="p-3"
        />
      </div>

      {/* Top-left status tabs + week + select */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <PaneHeaderTabs
          dense
          tabs={filterTabs}
          value={statusFilter}
          onChange={setStatusFilter}
          className="shrink-0 bg-transparent px-0 py-0"
        />
        <div className="h-4 w-px shrink-0 bg-border-hairline" aria-hidden />
        {weekRange && onPrevWeek && onNextWeek ? (
          <DateRangePickerPill
            label={weekPillLabel}
            count={sortedItems.length}
            weekNav={{ weekOffset, onPrev: onPrevWeek, onNext: onNextWeek }}
          />
        ) : (
          <span className="rounded-full border border-border-soft bg-surface-canvas px-3 py-1 text-role-caption font-bold tabular-nums text-text-soft">
            {sortedItems.length}
          </span>
        )}
        <div className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-2">
          {rightSlot}
          <Button
            type="button"
            variant="secondary"
            className="h-8 px-2.5 text-role-micro uppercase tracking-widest"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent(FBA_BOARD_TOGGLE_ALL, {
                  detail: allVisibleSelected ? 'none' : 'all',
                }),
              )
            }
          >
            {allVisibleSelected ? 'Clear' : 'Select all'}
          </Button>
          {someSelected ? (
            <span className="text-role-eyebrow uppercase tracking-widest tabular-nums text-text-soft">
              {selectedIds.size} selected
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <label className="sr-only" htmlFor="fba-board-filter">
          Filter board
        </label>
        <input
          id="fba-board-filter"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter title, FNSKU, ASIN, SKU, plan…"
          className="h-9 w-full max-w-md rounded-xl border border-border-soft bg-surface-canvas px-3 text-role-caption font-semibold text-text-default outline-none ring-0 placeholder:text-text-faint focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
        />
        {(statusFilter !== 'ALL' || query) && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter('ALL');
              setQuery('');
            }}
            className="text-role-eyebrow uppercase tracking-widest text-text-soft hover:text-text-default"
          >
            Reset filters
          </button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
        {toolbar}
        <div className={cn('flex-1 overflow-y-auto px-4 py-4 sm:px-6', contentClassName)}>
          <SkeletonList count={12} />
        </div>
      </div>
    );
  }

  if (sortedItems.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
        {toolbar}
        <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
          <div className="max-w-sm space-y-2">
            <p className={sectionLabel}>{emptyMessage || 'No items'}</p>
            {(statusFilter !== 'ALL' || query) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('ALL');
                  setQuery('');
                }}
                className="text-role-caption font-black uppercase tracking-widest text-blue-700 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
      {toolbar}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-auto px-4 pb-8 pt-3 sm:px-6 lg:px-8',
          contentClassName,
        )}
      >
        <div className="overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-sm">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-surface-card">
              <tr className="border-b border-border-soft text-left text-role-micro uppercase tracking-widest text-text-soft">
                <th className="w-10 px-3 py-3">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-3 py-3">ASIN</th>
                <th className="min-w-[200px] px-3 py-3">Title</th>
                <th className="px-3 py-3">FNSKU</th>
                <th className="px-3 py-3">Qty</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Condition</th>
                <th className="px-3 py-3">Due</th>
                <th className="px-3 py-3">Plan</th>
                <th className="w-12 px-3 py-3">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-hairline">
              {sortedItems.map((item, index) => {
                const isSelected = selectedIds.has(item.item_id);
                const due = item.due_date
                  ? formatDateKeyShort(String(item.due_date).slice(0, 10))
                  : '—';
                const planRef = item.shipment_ref || item.amazon_shipment_id || '';
                return (
                  <tr
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
                      'cursor-pointer transition-colors',
                      ui.rowFocusRing,
                      isSelected
                        ? 'bg-blue-50 ring-1 ring-inset ring-blue-400'
                        : 'bg-surface-card hover:bg-gray-50',
                    )}
                  >
                    <td className="px-3 py-3 align-middle">
                      <PrintTableCheckbox
                        checked={isSelected}
                        onChange={() => toggleItem(item.item_id)}
                        onClick={(e) => handleRowActivate(e, index, item)}
                        stationTheme={stationTheme}
                        label={`${isSelected ? 'Deselect' : 'Select'} ${item.fnsku}`}
                      />
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {item.asin ? (
                        <CopyChip value={item.asin} display={getLast4(item.asin)} tone="id" dense />
                      ) : (
                        <span className="text-role-caption text-text-faint">—</span>
                      )}
                    </td>
                    <td className="max-w-[320px] px-3 py-3 align-middle">
                      <p className="truncate text-role-caption font-bold text-gray-900">
                        {item.display_title || '—'}
                      </p>
                      {item.sku ? (
                        <p className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-gray-500">
                          {item.sku}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <FnskuChip value={item.fnsku} />
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="tabular-nums text-role-caption font-bold text-text-default">
                        {item.actual_qty}
                        <span className="text-text-faint"> / </span>
                        {item.expected_qty}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <StatusPill status={item.item_status} />
                    </td>
                    <td className="px-3 py-3 align-middle text-role-caption font-semibold text-text-soft">
                      {item.condition || '—'}
                    </td>
                    <td className="px-3 py-3 align-middle text-role-caption tabular-nums text-text-soft">
                      {due}
                    </td>
                    <td className="px-3 py-3 align-middle">
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
                    </td>
                    <td className="px-3 py-3 align-middle">
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
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
