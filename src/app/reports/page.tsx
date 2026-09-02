'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { AdminTable, type AdminTableColumn } from '@/design-system/components/AdminTable';
import { SessionsReportTable } from '@/features/reports/sessions/SessionsReportTable';

type Tab = 'sessions' | 'utilization' | 'velocity' | 'dead';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'utilization', label: 'Bin Utilization' },
  { id: 'velocity', label: 'Velocity (30d)' },
  { id: 'dead', label: 'Dead Stock (90d+)' },
];

function parseTab(raw: string | null): Tab {
  return raw === 'utilization' || raw === 'velocity' || raw === 'dead' ? raw : 'sessions';
}

type ReportRow = Record<string, unknown>;

const UTILIZATION_COLUMNS: AdminTableColumn<ReportRow>[] = [
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

const VELOCITY_COLUMNS: AdminTableColumn<ReportRow>[] = [
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

const DEAD_COLUMNS: AdminTableColumn<ReportRow>[] = [
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setTab = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set('tab', id);
      if (id !== 'sessions') {
        next.delete('staff');
        next.delete('q');
        next.delete('status');
        next.delete('scan');
      }
      const qs = next.toString();
      router.replace(qs ? `/reports?${qs}` : '/reports');
    },
    [router, searchParams],
  );

  const load = useCallback(async () => {
    if (tab === 'sessions') return;
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
    void load();
  }, [load]);

  return (
    <DeskPageLayout
      title="Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={(id) => setTab(id)}
      className="h-full"
    >
      {tab === 'sessions' ? null : (
        <DeskActionSlotRegistrar>
          <DeskHeaderAction variant="secondary" size="md" type="button" onClick={load}>
            Refresh
          </DeskHeaderAction>
        </DeskActionSlotRegistrar>
      )}
      {tab === 'sessions' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <SessionsReportTable />
        </div>
      ) : (
        <main className="min-h-0 flex-1 overflow-auto px-3 py-3">
          {error && (
            <p className="px-3 py-6 text-center text-sm font-semibold text-rose-600">{error}</p>
          )}
          {!error && <ReportTable tab={tab} rows={rows} loading={loading} />}
        </main>
      )}
    </DeskPageLayout>
  );
}

function ReportTable({
  tab,
  rows,
  loading,
}: {
  tab: Exclude<Tab, 'sessions'>;
  rows: ReportRow[];
  loading: boolean;
}) {
  if (tab === 'utilization') {
    return (
      <AdminTable
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
      <AdminTable
        columns={VELOCITY_COLUMNS}
        rows={rows}
        rowKey={(r) => String(r.sku)}
        loading={loading}
        emptyMessage="No data — try the daily refresh cron, or write some movement."
      />
    );
  }
  return (
    <AdminTable
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
