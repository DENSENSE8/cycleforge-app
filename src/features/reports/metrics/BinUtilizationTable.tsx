'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BinsTable } from '@/components/warehouse/BinsTable';
import type { BinsOverviewRow } from '@/hooks/useBinsOverview';
import { utilizationToBinRow } from '@/features/reports/metrics/report-rows';

const EMPTY_SELECTED = new Set<number>();

export function BinUtilizationTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('q') ?? '';

  const [rows, setRows] = useState<BinsOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const writeParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      next.set('tab', 'utilization');
      const qs = next.toString();
      router.replace(qs ? `/reports?${qs}` : '/reports');
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/bin-utilization?limit=500', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const raw = Array.isArray(data?.rows) ? data.rows : [];
      setRows(raw.map((r: Record<string, unknown>) => utilizationToBinRow(r)));
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.barcode, r.name, r.room, r.row_label, r.col_label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query, rows]);

  return (
    <BinsTable
      rows={visible}
      loading={loading}
      selected={EMPTY_SELECTED}
      onSelectChange={() => {}}
      onRowClick={() => {}}
      search={{
        value: query,
        onChange: (next) =>
          writeParams((p) => {
            if (!next) p.delete('q');
            else p.set('q', next);
          }),
        placeholder: 'Filter bins…',
      }}
      emptyMessage={
        error
          ? error
          : query.trim() !== ''
            ? 'No bins match that search.'
            : 'No data — try the daily refresh cron, or write some movement.'
      }
    />
  );
}
