'use client';

/** Inventory shell › by-filter unit list — the same `inventory-units` family as `/inventory/units`, pointed at the state/condition feed. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/tables/DataTable';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { useUnitsSpreadsheet } from './units-grid/useUnitsSpreadsheet';
import type { UnitListResponse, UnitListRow } from './types';
import type { UnitsOverviewRow } from '@/hooks/useUnitsOverview';
import type { UnitsGridColumnKey } from './units-grid/units-grid-layout';

const PAGE_SIZE = 100;

interface ByFilterResultListProps {
  states: string[];
  conditions: string[];
}

function toOverviewRow(row: UnitListRow): UnitsOverviewRow {
  return {
    id: row.id,
    serial_number: row.serial_number,
    product_title: row.product_title,
    sku: row.sku,
    current_status: row.current_status,
    condition_grade: row.condition_grade,
    current_location: row.current_location,
    updated_at: row.updated_at,
  };
}

export function ByFilterResultList({ states, conditions }: ByFilterResultListProps) {
  const router = useRouter();
  const [rows, setRows] = useState<UnitListRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<UnitsGridColumnKey | null>(null);
  const [dir, setDir] = useState<GridSortDir | null>(null);
  const [query, setQuery] = useState('');
  const requestIdRef = useRef(0);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const requestId = ++requestIdRef.current;
      if (!append) setLoading(true);
      setError(null);

      try {
        const sp = new URLSearchParams();
        if (states.length > 0) sp.set('state', states.join(','));
        if (conditions.length > 0) sp.set('condition', conditions.join(','));
        sp.set('limit', String(PAGE_SIZE));
        sp.set('offset', String(offset));
        const res = await fetch(`/api/inventory/units?${sp.toString()}`, {
          credentials: 'same-origin',
        });
        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body?.error) message = body.error;
          } catch {
            // ignore JSON parse failure
          }
          throw new Error(message);
        }
        const payload: UnitListResponse = await res.json();
        if (!payload.success) throw new Error('Server reported failure');
        if (requestId !== requestIdRef.current) return;
        setRows((prev) => (append ? [...prev, ...payload.items] : payload.items));
        setTotal(payload.total);
      } catch (err: unknown) {
        if (requestId !== requestIdRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to load units';
        setError(message);
        if (!append) {
          setRows([]);
          setTotal(null);
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [states, conditions],
  );

  useEffect(() => {
    void fetchPage(0, false);
  }, [fetchPage]);

  const overviewRows = useMemo(() => rows.map(toOverviewRow), [rows]);
  const hasMore = total !== null && rows.length < total;

  const sheet = useUnitsSpreadsheet({
    rows: overviewRows,
    loading: loading && rows.length === 0,
    emptyMessage: error ?? 'No units match these filters.',
    search: { value: query, onChange: setQuery, placeholder: 'Filter units…' },
    sort,
    dir,
    onSortChange: (key, nextDir) => {
      setSort(key);
      setDir(nextDir);
    },
    onOpen: (row) => router.push(`/inventory?unit=${row.id}`),
    totalCount: total ?? undefined,
    onLoadMore: hasMore ? () => void fetchPage(rows.length, true) : undefined,
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <DataTable {...sheet} />
    </div>
  );
}
