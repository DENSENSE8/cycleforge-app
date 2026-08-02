'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PageHeader } from '@/components/ui/pane-header';
import { Button } from '@/design-system/primitives';
import { DataTable, type DataTableColumn } from '@/design-system/components/DataTable';

type Tab = 'utilization' | 'velocity' | 'dead';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'utilization', label: 'Bin Utilization' },
  { id: 'velocity', label: 'Velocity (30d)' },
  { id: 'dead', label: 'Dead Stock (90d+)' },
];

type ReportRow = Record<string, unknown>;

const UTILIZATION_COLUMNS: DataTableColumn<ReportRow>[] = [
  {
    key: 'bin',
    header: 'Bin',
    type: 'id',
    cell: (r) => (
      <span className="font-mono font-semibold">{String(r.barcode ?? r.bin_name ?? '')}</span>
    ),
  },
  {
    key: 'room',
    header: 'Room',
    type: 'text',
    cell: (r) => <span className="text-text-muted">{String(r.room ?? '—')}</span>,
  },
  {
    key: 'fill',
    header: 'Fill',
    type: 'number',
    cell: (r) => (
      <span className="font-mono">
        {r.fill_ratio != null ? `${(Number(r.fill_ratio) * 100).toFixed(0)}%` : '—'}
      </span>
    ),
  },
  {
    key: 'qty',
    header: 'Qty',
    type: 'number',
    cell: (r) => <span className="font-mono font-semibold">{Number(r.in_bin)}</span>,
  },
  {
    key: 'cap',
    header: 'Cap',
    type: 'number',
    cell: (r) => (
      <span className="font-mono text-text-muted">
        {r.capacity != null ? Number(r.capacity) : '—'}
      </span>
    ),
  },
  {
    key: 'skus',
    header: 'SKUs',
    type: 'number',
    cell: (r) => <span className="font-mono text-text-muted">{Number(r.sku_count)}</span>,
  },
];

const VELOCITY_COLUMNS: DataTableColumn<ReportRow>[] = [
  {
    key: 'tier',
    header: 'Tier',
    type: 'tag',
    cell: (r) => <span className="font-semibold">{String(r.velocity_tier)}</span>,
  },
  {
    key: 'sku',
    header: 'SKU',
    type: 'id',
    cell: (r) => <span className="font-mono font-semibold">{String(r.sku)}</span>,
  },
  {
    key: 'product',
    header: 'Product',
    type: 'longtext',
    cell: (r) => (
      <span className="max-w-md truncate text-text-muted">{String(r.product_title ?? '—')}</span>
    ),
  },
  {
    key: 'out',
    header: 'Out',
    type: 'number',
    cell: (r) => (
      <span className="font-mono font-semibold text-rose-600">{Number(r.out_qty)}</span>
    ),
  },
  {
    key: 'in',
    header: 'In',
    type: 'number',
    cell: (r) => (
      <span className="font-mono text-emerald-600">{Number(r.in_qty)}</span>
    ),
  },
  {
    key: 'stock',
    header: 'Stock',
    type: 'number',
    cell: (r) => (
      <span className="font-mono text-text-muted">{Number(r.current_stock ?? 0)}</span>
    ),
  },
];

const DEAD_COLUMNS: DataTableColumn<ReportRow>[] = [
  {
    key: 'sku',
    header: 'SKU',
    type: 'id',
    cell: (r) => <span className="font-mono font-semibold">{String(r.sku)}</span>,
  },
  {
    key: 'product',
    header: 'Product',
    type: 'longtext',
    cell: (r) => (
      <span className="max-w-md truncate text-text-muted">{String(r.product_title ?? '—')}</span>
    ),
  },
  {
    key: 'stock',
    header: 'Stock',
    type: 'number',
    cell: (r) => <span className="font-mono font-semibold">{Number(r.stock)}</span>,
  },
  {
    key: 'days_dormant',
    header: 'Days dormant',
    type: 'number',
    cell: (r) => (
      <span className="font-mono text-rose-600">{Number(r.days_dormant)}</span>
    ),
  },
];

function ReportsPageInner() {
  const [tab, setTab] = useState<Tab>('utilization');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url =
        tab === 'utilization'
          ? '/api/reports/bin-utilization?limit=500'
          : tab === 'velocity'
          ? '/api/reports/velocity?limit=200'
          : '/api/reports/dead-stock?limit=500';
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-card">
      <PageHeader
        title="Reports"
        rightSlot={
          <Button variant="secondary" size="sm" type="button" onClick={load}>
            Refresh
          </Button>
        }
        belowSlot={
          <div className="flex gap-2 border-t border-border-hairline px-3 py-2">
            {TABS.map((t) => (
              // ds-raw-button: segmented tab toggle (aria-pressed, conditional active fill), not a single DS variant
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  tab === t.id
                    ? 'bg-surface-inverse text-white'
                    : 'border border-border-default bg-surface-card text-text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      <main className="min-h-0 flex-1 overflow-auto px-3 py-3">
        {error && (
          <p className="px-3 py-6 text-center text-sm font-semibold text-rose-600">{error}</p>
        )}
        {!error && <ReportTable tab={tab} rows={rows} loading={loading} />}
      </main>
    </div>
  );
}

function ReportTable({
  tab,
  rows,
  loading,
}: {
  tab: Tab;
  rows: ReportRow[];
  loading: boolean;
}) {
  if (tab === 'utilization') {
    return (
      <DataTable
        columns={UTILIZATION_COLUMNS}
        rows={rows}
        rowKey={(r) => String(r.bin_id)}
        loading={loading}
        emptyMessage="No data — try the daily refresh cron, or write some movement."
      />
    );
  }
  if (tab === 'velocity') {
    return (
      <DataTable
        columns={VELOCITY_COLUMNS}
        rows={rows}
        rowKey={(r) => String(r.sku)}
        loading={loading}
        emptyMessage="No data — try the daily refresh cron, or write some movement."
      />
    );
  }
  return (
    <DataTable
      columns={DEAD_COLUMNS}
      rows={rows}
      rowKey={(r) => String(r.sku)}
      loading={loading}
      emptyMessage="No data — try the daily refresh cron, or write some movement."
    />
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
          <LoadingSpinner size="lg" className="text-blue-600" />
        </div>
      }
    >
      <ReportsPageInner />
    </Suspense>
  );
}
