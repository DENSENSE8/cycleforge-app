/**
 * The inventory diagnostics dashboard's row sections — SECTION CHROME ONLY.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). This file was FOUR `AdminTable` mounts
 * of four different row kinds behind four hand-written `AdminTableColumn`
 * arrays carrying JSX — a second table engine's column type, with no header
 * sort, no Fields picker, no search and no org binding, because that engine
 * never grew them. Two of those mounts are now registered families, one reuses
 * a family that already existed, and one is not a table at all:
 *
 * | retired section       | where it went                                     |
 * |-----------------------|---------------------------------------------------|
 * | `DriftAlertsSection`  | `admin-drift-alerts` (new family)                 |
 * | `DriftSection`        | `admin-sku-drift` (new family)                    |
 * | `AllocationsSection`  | a KPI TILE BAND — registers nothing               |
 * | `RecentEventsSection` | the REGISTERED `inventory-events` family          |
 *
 * **Allocations is not a family.** `AllocationRow` is a `GROUP BY state`
 * bucket — state, count, oldest — and a row must be ONE entity for a
 * registration to mean anything: an org rebinding columns on an aggregate is
 * a layout document behind a summary, and there is no record behind a bucket
 * to open. Three facts read as tiles, so it is tiles (operator ruling
 * 2026-09-12, recorded on `ADMIN_TABLE_ALLOW` beside the two other aggregate
 * desks that went the same way).
 *
 * **Recent events mints nothing.** `RECENT_EVENT_COLUMNS` painted facts the
 * `inventory-events` catalog already names, so this page is a second MOUNT of
 * that family (invariant 2: one entity, one registration, many mounts) with a
 * row translation in `./inventory-admin-rows` — never a forked catalog. The
 * retired `Unit / SKU` cell packed two independent links into one track; the
 * family splits them across the identity chip and the serial track.
 *
 * **The clean-drift paragraph is an empty STATE now, not an empty BRANCH.**
 * `DriftSection` used to swap the whole table out for prose when
 * `v_sku_stock_drift` was empty. The sentence is the desk's settled-with-no-rows
 * answer and lives on the family's feed hook (`SKU_DRIFT_CLEAN_MESSAGE`), so
 * the table stays mounted and its headers and Fields menu stay reachable.
 *
 * What is left here is the chrome an RSC owns: headings, the count badges, the
 * two route links and the tile band. The three table mounts cross the client
 * boundary in `./InventoryAdminTables.tsx`.
 */

import Link from 'next/link';
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

/**
 * Open allocation summary by state — a KPI tile band, not a table.
 *
 * One tile per `order_unit_allocations.state` bucket: the count is the number,
 * and the oldest allocation rides beside it as the second fact (the same
 * count-over-stamp tile the throughput desk's by-actor band paints).
 */
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
          description="Orders auto-allocate against STOCKED units on intake."
        />
      ) : (
        <OpsKpiBand aria-label="Open allocations by state">
          {allocations.map((a) => (
            <OpsKpiBandCell key={`state:${a.state}`}>
              <KpiTile
                label={a.state}
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
