'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable, type DataTableFilterOption } from '@/components/tables/DataTable';
import { CompoundRow } from '@/components/tables/compound/CompoundRow';
import { compareGridValues } from '@/design-system/components/grid';
import { singleBand, type RowGroup } from '@/lib/group-rows';
import { useUrlColumnSort } from '@/hooks/useUrlColumnSort';
import {
  defaultDirForSkuVelocityGridSort,
  isSkuVelocitySortFact,
  skuVelocityColumnKeyForSort,
  skuVelocityCompoundColumnsFor,
  skuVelocitySortFactFor,
  SKU_VELOCITY_SORT_FACT_TYPES,
  type SkuVelocityGridColumn,
  type SkuVelocityGridColumnKey,
  type SkuVelocitySortFact,
} from '@/lib/reports/sku-velocity-grid-layout';
import { skuVelocitySlotValuesFor, resolveSkuVelocitySlotValue } from '@/lib/tables/field-catalog/sku-velocity-resolve';
import { slotSubtitlePartsFor } from '@/lib/tables/slot-table-line-qty';
import { parseSkuVelocityRow, type SkuVelocityRow } from '@/features/reports/metrics/report-rows';
import { skuVelocityCompoundView } from '@/features/reports/metrics/sku-velocity-compound-view';
import { SKU_VELOCITY_GRID_CAPABILITIES } from '@/features/reports/metrics/sku-velocity-grid-descriptor';
import { SKU_VELOCITY_TABLE_BINDING } from '@/features/reports/metrics/sku-velocity-table-definition';
import { useSkuVelocityTableLayout } from '@/features/reports/metrics/useSkuVelocityTableLayout';

const TIERS = ['A', 'B', 'C', 'D'] as const;
type VelocityTier = (typeof TIERS)[number];

function parseTier(raw: string | null): VelocityTier | null {
  return TIERS.includes(raw as VelocityTier) ? (raw as VelocityTier) : null;
}

export function SkuVelocityTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const tier = parseTier(searchParams.get('tier'));

  const { effectiveLayout, fields, subtitleFieldIds } = useSkuVelocityTableLayout();
  const columns = useMemo(
    () => skuVelocityCompoundColumnsFor(effectiveLayout),
    [effectiveLayout],
  );

  const [rows, setRows] = useState<SkuVelocityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const writeParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      next.set('tab', 'velocity');
      const qs = next.toString();
      router.replace(qs ? `/reports?${qs}` : '/reports');
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (tier) params.set('tier', tier);
      const res = await fetch(`/api/reports/velocity?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const raw = Array.isArray(data?.rows) ? data.rows : [];
      setRows(raw.map((r: Record<string, unknown>) => parseSkuVelocityRow(r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tier]);

  useEffect(() => {
    void load();
  }, [load]);

  const {
    sort: columnSort,
    dir: sortDir,
    setSort,
  } = useUrlColumnSort<SkuVelocitySortFact>({
    isColumn: isSkuVelocitySortFact,
    defaultDir: defaultDirForSkuVelocityGridSort,
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
      return [...filtered].sort((a, b) => b.out_qty - a.out_qty || a.sku.localeCompare(b.sku));
    }
    const type = SKU_VELOCITY_SORT_FACT_TYPES[columnSort];
    const value = (r: SkuVelocityRow) => {
      switch (columnSort) {
        case 'sku':
        case 'order':
          return r.sku;
        case 'product':
          return r.product_title;
        case 'tier':
          return r.velocity_tier;
        case 'out':
          return r.out_qty;
        case 'in':
          return r.in_qty;
        case 'stock':
        case 'amount':
          return r.current_stock;
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
    () => singleBand(sorted, (r) => r.sku) as [string, RowGroup<SkuVelocityRow>[]][],
    [sorted],
  );

  const filterOptions = useMemo((): DataTableFilterOption[] => {
    return [
      { id: 'all', group: 'Tier', label: 'All', active: tier == null },
      ...TIERS.map((id) => ({
        id,
        group: 'Tier',
        label: id,
        active: tier === id,
      })),
    ];
  }, [tier]);

  const paintRow = (row: SkuVelocityRow, visible: readonly SkuVelocityGridColumn[]) => (
    <CompoundRow
      key={row.sku}
      columns={visible}
      capabilities={SKU_VELOCITY_GRID_CAPABILITIES}
      selected={false}
      view={{
        slots: skuVelocitySlotValuesFor(row, visible),
        ...skuVelocityCompoundView(row),
        ...(subtitleFieldIds.length > 0
          ? {
              subtitleParts: slotSubtitlePartsFor(subtitleFieldIds, (fieldId) =>
                resolveSkuVelocitySlotValue(row, fieldId),
              ),
            }
          : null),
      }}
    />
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card">
      <DataTable<SkuVelocityRow, SkuVelocityGridColumnKey, SkuVelocityGridColumn>
        binding={SKU_VELOCITY_TABLE_BINDING}
        columns={columns}
        fields={fields}
        orderGroupsByDate={groups}
        rows={sorted}
        getRowId={(r) => r.sku}
        sort={skuVelocityColumnKeyForSort(columns, columnSort)}
        dir={sortDir}
        onSortChange={(key, nextDir) => {
          const fact = skuVelocitySortFactFor(
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
        filter={{
          options: filterOptions,
          onToggle: (id) => {
            writeParams((p) => {
              if (id === 'all' || id === tier) p.delete('tier');
              else if (TIERS.includes(id as VelocityTier)) p.set('tier', id);
            });
          },
          onClearAll: () => writeParams((p) => p.delete('tier')),
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
