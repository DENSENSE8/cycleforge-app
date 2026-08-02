import Link from 'next/link';
import { DataTable, type DataTableColumn } from '@/design-system/components/DataTable';
import type {
  AllocationRow,
  DriftAlertRow,
  DriftRow,
  RecentEventRow,
} from './inventory-admin-data';

const DRIFT_ALERT_COLUMNS: DataTableColumn<DriftAlertRow>[] = [
  {
    key: 'sku',
    header: 'SKU',
    type: 'id',
    cell: (a) => (
      <a
        href={`/admin/inventory/sku/${encodeURIComponent(a.sku)}`}
        className="font-mono text-xs text-red-700 hover:underline"
      >
        {a.sku}
      </a>
    ),
  },
  {
    key: 'qty',
    header: 'Worst |Δ|',
    type: 'number',
    cell: (a) => (
      <span className="font-semibold text-red-700">{a.qty_at_trigger ?? '—'}</span>
    ),
  },
  {
    key: 'triggered',
    header: 'Triggered',
    type: 'date',
    cell: (a) => (
      <span className="text-xs text-red-700">{new Date(a.triggered_at).toLocaleString()}</span>
    ),
  },
  {
    key: 'detail',
    header: 'Detail',
    type: 'longtext',
    cell: (a) => (
      <span className="font-mono text-role-caption text-text-muted">{a.notes ?? '—'}</span>
    ),
  },
];

/** Open DRIFT alerts — surfaced by /api/cron/inventory/drift-check. */
export function DriftAlertsSection({ openDriftAlerts }: { openDriftAlerts: DriftAlertRow[] }) {
  if (openDriftAlerts.length === 0) return null;
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-6 py-4">
        <h2 className="text-lg font-medium text-red-900">Open DRIFT alerts</h2>
        <span className="rounded-full bg-red-200 px-3 py-1 text-xs font-medium text-red-800">
          {openDriftAlerts.length} open
        </span>
      </header>
      <DataTable
        columns={DRIFT_ALERT_COLUMNS}
        rows={openDriftAlerts}
        rowKey={(a) => a.id}
      />
    </section>
  );
}

const DRIFT_COLUMNS: DataTableColumn<DriftRow>[] = [
  {
    key: 'sku',
    header: 'SKU',
    type: 'id',
    cell: (d) => <span className="font-mono text-xs">{d.sku}</span>,
  },
  { key: 'stored_wh', header: 'Stored WH', type: 'number', cell: (d) => d.stored_stock },
  { key: 'ledger_wh', header: 'Ledger WH', type: 'number', cell: (d) => d.ledger_warehouse },
  {
    key: 'delta_wh',
    header: 'Δ WH',
    type: 'number',
    cell: (d) => (
      <span className={`font-semibold ${d.warehouse_drift === 0 ? 'text-text-faint' : 'text-red-700'}`}>
        {d.warehouse_drift > 0 ? '+' : ''}
        {d.warehouse_drift}
      </span>
    ),
  },
  { key: 'stored_boxed', header: 'Stored Boxed', type: 'number', cell: (d) => d.stored_boxed },
  { key: 'ledger_boxed', header: 'Ledger Boxed', type: 'number', cell: (d) => d.ledger_boxed },
  {
    key: 'delta_boxed',
    header: 'Δ Boxed',
    type: 'number',
    cell: (d) => (
      <span className={`font-semibold ${d.boxed_drift === 0 ? 'text-text-faint' : 'text-red-700'}`}>
        {d.boxed_drift > 0 ? '+' : ''}
        {d.boxed_drift}
      </span>
    ),
  },
];

/** sku_stock ↔ ledger drift report. */
export function DriftSection({ drift, driftClean }: { drift: DriftRow[]; driftClean: boolean }) {
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-text-default">SKU stock drift</h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            driftClean ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {driftClean ? 'clean' : `${drift.length} SKUs out of sync`}
        </span>
      </header>
      {driftClean ? (
        <p className="rounded-xl border border-border-soft bg-surface-card px-6 py-4 text-sm text-text-muted shadow-sm">
          sku_stock.stock equals SUM(sku_stock_ledger.delta) for every SKU. The trigger is working.
        </p>
      ) : (
        <DataTable columns={DRIFT_COLUMNS} rows={drift} rowKey={(d) => d.sku} />
      )}
    </section>
  );
}

const ALLOCATION_COLUMNS: DataTableColumn<AllocationRow>[] = [
  {
    key: 'state',
    header: 'State',
    type: 'tag',
    cell: (a) => <span className="font-mono text-xs">{a.state}</span>,
  },
  { key: 'count', header: 'Count', type: 'number', cell: (a) => a.count },
  {
    key: 'oldest',
    header: 'Oldest',
    type: 'date',
    cell: (a) => <span className="text-xs text-text-soft">{a.oldest ?? '—'}</span>,
  },
];

/** Open allocation summary by state. */
export function AllocationsSection({ allocations }: { allocations: AllocationRow[] }) {
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-text-default">Order unit allocations</h2>
        <Link
          href="/admin/inventory/bulk-allocate"
          className="rounded-md border border-border-default bg-surface-card px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-hover"
        >
          Bulk allocate →
        </Link>
      </header>
      <DataTable
        columns={ALLOCATION_COLUMNS}
        rows={allocations}
        rowKey={(a) => a.state}
        emptyMessage="No allocations yet. Orders auto-allocate against STOCKED units on intake."
      />
    </section>
  );
}

const RECENT_EVENT_COLUMNS: DataTableColumn<RecentEventRow>[] = [
  {
    key: 'when',
    header: 'When',
    type: 'date',
    cell: (e) => (
      <span className="text-xs text-text-soft">{new Date(e.occurred_at).toLocaleString()}</span>
    ),
  },
  {
    key: 'event',
    header: 'Event',
    type: 'tag',
    cell: (e) => <span className="font-mono text-xs">{e.event_type}</span>,
  },
  {
    key: 'station',
    header: 'Station',
    type: 'text',
    cell: (e) => <span className="text-xs text-text-muted">{e.station ?? '—'}</span>,
  },
  {
    key: 'unit_sku',
    header: 'Unit / SKU',
    type: 'id',
    cell: (e) => (
      <span className="text-xs">
        {e.serial_unit_id ? (
          <Link href={`/admin/inventory/units/${e.serial_unit_id}`} className="text-blue-600 hover:underline">
            #{e.serial_unit_id}
          </Link>
        ) : null}
        {e.serial_unit_id && e.sku ? <span className="px-1 text-text-faint">·</span> : null}
        {e.sku ? (
          <Link
            href={`/admin/inventory/sku/${encodeURIComponent(e.sku)}`}
            className="text-blue-600 hover:underline"
          >
            {e.sku}
          </Link>
        ) : null}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    type: 'tag',
    cell: (e) => (
      <span className="text-xs text-text-muted">
        {e.prev_status && e.next_status
          ? `${e.prev_status} → ${e.next_status}`
          : (e.next_status ?? '—')}
      </span>
    ),
  },
  {
    key: 'actor',
    header: 'Actor',
    type: 'text',
    cell: (e) => (
      <span className="text-xs">
        {e.actor_name ?? (e.actor_staff_id ? `#${e.actor_staff_id}` : 'system')}
      </span>
    ),
  },
];

/** Recent inventory_events (last 50, with status diff + actor). */
export function RecentEventsSection({ events }: { events: RecentEventRow[] }) {
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-text-default">Recent inventory events</h2>
          <p className="mt-1 text-xs text-text-soft">
            Last 50 across all phases. Empty until a flagged path emits.
          </p>
        </div>
        <Link
          href="/admin/inventory/events"
          className="rounded-md border border-border-default bg-surface-card px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-hover"
        >
          Open explorer →
        </Link>
      </header>
      <DataTable
        columns={RECENT_EVENT_COLUMNS}
        rows={events}
        rowKey={(e) => e.id}
        emptyMessage="No events yet."
      />
    </section>
  );
}
