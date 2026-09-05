'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import { CompoundRow } from '@/components/tables/compound/CompoundRow';
import { compareGridValues } from '@/design-system/components/grid';
import { singleBand, type RowGroup } from '@/lib/group-rows';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import {
  defaultDirForDeadStockGridSort,
  isDeadStockSortFact,
  deadStockColumnKeyForSort,
  deadStockCompoundColumnsFor,
  deadStockSortFactFor,
  DEAD_STOCK_SORT_FACT_TYPES,
  type DeadStockGridColumn,
  type DeadStockGridColumnKey,
  type DeadStockSortFact,
} from '@/lib/reports/dead-stock-grid-layout';
import { deadStockSlotValuesFor, resolveDeadStockSlotValue } from '@/lib/tables/field-catalog/dead-stock-resolve';
import { slotSubtitlePartsFor } from '@/lib/tables/slot-table-line-qty';
import { parseDeadStockRow, type DeadStockRow } from '@/features/reports/metrics/report-rows';
import { deadStockCompoundView } from '@/features/reports/metrics/dead-stock-compound-view';
import { DEAD_STOCK_GRID_CAPABILITIES } from '@/features/reports/metrics/dead-stock-grid-descriptor';
import { DEAD_STOCK_TABLE_BINDING } from '@/features/reports/metrics/dead-stock-table-definition';
import { useDeadStockTableLayout } from '@/features/reports/metrics/useDeadStockTableLayout';

export function DeadStockTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';

  const { effectiveLayout, fields, subtitleFieldIds } = useDeadStockTableLayout();
  const columns = useMemo(
    () => deadStockCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const [rows, setRows] = useState<DeadStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const writeParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      next.set('tab', 'dead');
      const qs = next.toString();
      router.replace(qs ? `/reports?${qs}` : '/reports');
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/dead-stock?limit=500', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const raw = Array.isArray(data?.rows) ? data.rows : [];
      setRows(raw.map((r: Record<string, unknown>) => parseDeadStockRow(r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<DeadStockSortFact>({
    isColumn: isDeadStockSortFact,
    defaultDir: defaultDirForDeadStockGridSort,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.sku.toLowerCase().includes(q) ||
        (r.product_title ?? '').toLowerCase().includes(q),
    );
  }, [query, rows]);

  const sorted = useMemo(() => {
    if (!columnSort || !sortDir) {
      return [...filtered].sort((a, b) => b.days_dormant - a.days_dormant || a.sku.localeCompare(b.sku));
    }
    const type = DEAD_STOCK_SORT_FACT_TYPES[columnSort];
    const value = (r: DeadStockRow) => {
      switch (columnSort) {
        case 'sku':
        case 'order':
          return r.sku;
        case 'product':
          return r.product_title;
        case 'days':
          return r.days_dormant;
        case 'stock':
        case 'amount':
          return r.stock;
        default:
          return null;
      }
    };
    return [...filtered].sort((a, b) => {
      const primary = compareGridValues(value(a), value(b), { type, dir: sortDir });
      return primary !== 0 ? primary : a.sku.localeCompare(b.sku);
    });
  }, [columnSort, filtered, sortDir]);

  const groups = useMemo(
    () => singleBand(sorted, (r) => r.sku) as [string, RowGroup<DeadStockRow>[]][],
    [sorted],
  );

  const paintRow = (row: DeadStockRow, visible: readonly DeadStockGridColumn[]) => (
    <CompoundRow
      key={row.sku}
      columns={visible}
      capabilities={DEAD_STOCK_GRID_CAPABILITIES}
      selected={false}
      view={{
        slots: deadStockSlotValuesFor(row, visible),
        ...deadStockCompoundView(row),
        ...(subtitleFieldIds.length > 0
          ? {
              subtitleParts: slotSubtitlePartsFor(subtitleFieldIds, (fieldId) =>
                resolveDeadStockSlotValue(row, fieldId),
              ),
            }
          : null),
      }}
    />
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
      <DataTable<DeadStockRow, DeadStockGridColumnKey, DeadStockGridColumn>
        binding={DEAD_STOCK_TABLE_BINDING}
        columns={columns}
        fields={fields}
        orderGroupsByDate={groups}
        rows={sorted}
        getRowId={(r) => r.sku}
        sort={deadStockColumnKeyForSort(columns, columnSort)}
        dir={sortDir}
        onSortChange={(key, nextDir) => {
          const fact = deadStockSortFactFor(
            columns.find((c) => c.key === key) ?? { key, sortable: true },
          );
          if (fact) setSort(fact, nextDir);
        }}
        loading={loading}
        search={{
          value: query,
          onChange: (next) =>
            writeParams((p) => {
              if (!next) p.delete('q');
              else p.set('q', next);
            }),
          placeholder: 'Filter SKU or product…',
        }}
        emptyMessage={
          error
            ? error
            : query.trim() !== ''
              ? 'No SKU matches that search.'
              : 'No data — try the daily refresh cron, or write some movement.'
        }
        renderGroup={(group, _stripe, { columns: visible }) => (
          <>{group.rows.map((row) => paintRow(row, visible))}</>
        )}
        renderRow={(row, _stripe, { columns: visible }) => paintRow(row, visible)}
      />
    </div>
  );
}
