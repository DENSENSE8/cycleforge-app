'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { DeskActionSlotRegistrar } from '@/design-system/components/DeskActionSlot';
import { Button } from '@/design-system/primitives';
import { AdminTable, type AdminTableColumn } from '@/design-system/components/AdminTable';

type Tab = 'utilization' | 'velocity' | 'dead';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'utilization', label: 'Bin Utilization' },
  { id: 'velocity', label: 'Velocity (30d)' },
  { id: 'dead', label: 'Dead Stock (90d+)' },
];

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

  /*
   * The desk frame, not a second one (2026-08-31).
   *
   * This drew a `PageHeader` plus its own segmented tab strip — a filled-face
   * selection (`bg-surface-inverse text-white`) beside the underline row every
   * other page uses. Two tab vocabularies on one product is the fork the chrome
   * moved into the design system to end.
   *
   * The tabs are passed EXPLICITLY because Reports' modes are local view state,
   * not nav children: `/reports` has no spine drill-down to withdraw, so there
   * is nothing for `deskChrome` to opt into. The frame takes them as data
   * either way — which is the point of it taking data.
   *
   * `title` is passed for the same reason: the spine does not name this page,
   * so the default (its nav label) would be empty.
   */
  return (
    <DeskPageLayout
      title="Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      className="h-full"
    >
      <DeskActionSlotRegistrar>
        <Button variant="secondary" size="md" type="button" onClick={load}>
          Refresh
        </Button>
      </DeskActionSlotRegistrar>
      <main className="min-h-0 flex-1 overflow-auto px-3 py-3">
        {error && (
          <p className="px-3 py-6 text-center text-sm font-semibold text-rose-600">{error}</p>
        )}
        {!error && <ReportTable tab={tab} rows={rows} loading={loading} />}
      </main>
    </DeskPageLayout>
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
