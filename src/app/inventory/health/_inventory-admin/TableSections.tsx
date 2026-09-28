/** The inventory diagnostics dashboard's row sections — SECTION CHROME ONLY. */

import Link from 'next/link';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';
import {
  KpiTile,
  OpsKpiBand,
  OpsKpiBandCell,
  OpsKpiBandEmpty,
} from '@/design-system/components/monitor';
import type { DriftAlertRow, SkuDriftRow } from '@/lib/inventory/drift-rows';
import type { AllocationRow, RecentEventRow } from './inventory-admin-data';
import {
  DriftAlertsTable,
  RecentInventoryEventsTable,
  SkuDriftTable,
} from './InventoryAdminTables';

/** Open drift alerts — surfaced by /api/cron/inventory/drift-check. */
export function DriftAlertsSection({ openDriftAlerts }: { openDriftAlerts: DriftAlertRow[] }) {
  if (openDriftAlerts.length === 0) return null;
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-6 py-4">
        <h2 className="text-lg font-medium text-red-900">Open drift alerts</h2>
        <span className="rounded-full bg-red-200 px-3 py-1 text-xs font-medium text-red-800">
          {openDriftAlerts.length} open
        </span>
      </header>
      <DriftAlertsTable rows={openDriftAlerts} />
    </section>
  );
}

/** sku_stock ↔ ledger drift report. */
export function DriftSection({ drift, driftClean }: { drift: SkuDriftRow[]; driftClean: boolean }) {
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
      <SkuDriftTable rows={drift} />
    </section>
  );
}

/** Open allocation summary by state — a KPI tile band, not a table. */
export function AllocationsSection({ allocations }: { allocations: AllocationRow[] }) {
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-text-default">Order unit allocations</h2>
        <Link
          href="/inventory/bulk-allocate"
          className="rounded-md border border-border-default bg-surface-card px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-hover"
        >
          Bulk allocate →
        </Link>
      </header>
      {allocations.length === 0 ? (
        <OpsKpiBandEmpty
          title="No allocations yet."
          description="Orders auto-allocate against stocked units on intake."
        />
      ) : (
        <OpsKpiBand aria-label="Open allocations by state">
          {allocations.map((a) => (
            <OpsKpiBandCell key={`state:${a.state}`}>
              <KpiTile
                label={sentenceCaseLabel(a.state)}
                labelClassName="normal-case tracking-normal truncate"
                value={
                  <>
                    {a.count}
                    <span className="ml-2 align-middle text-role-caption font-normal tracking-normal text-text-soft">
                      {a.oldest ? `oldest ${a.oldest}` : '—'}
                    </span>
                  </>
                }
              />
            </OpsKpiBandCell>
          ))}
        </OpsKpiBand>
      )}
    </section>
  );
}

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
          href="/inventory/events"
          className="rounded-md border border-border-default bg-surface-card px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-hover"
        >
          Open explorer →
        </Link>
      </header>
      <RecentInventoryEventsTable events={events} />
    </section>
  );
}
