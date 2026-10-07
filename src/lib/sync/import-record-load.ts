/**
 * DB-backed deps for the import recorder (`import-record.ts`). Kept off the
 * pure module so unit tests never import the Neon pool. Every write runs in
 * `withTenantTransaction(orgId, …)` and stamps `organization_id` explicitly.
 */
import type { SyncOutcome } from '@/lib/integrations/connectors/types';
import type { ImportRowRecord } from '@/lib/imports/types';
import { listSweepOrgIds } from '@/lib/cron/for-each-org';
import { logger } from '@/lib/observability/logger';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { canonicalAccountSource } from '@/lib/orders/account-source';
import { recordProviderSync, type ImportRecordDeps, type ImportRunMeta } from './import-record';

/** Rows per INSERT: 16 binds each, far under Postgres' 65535-bind ceiling. */
const ROWS_PER_INSERT = 1000;
const ROW_BINDS = 16;

function rowValues(row: ImportRowRecord): unknown[] {
  return [
    row.orderRowId,
    row.externalOrderId,
    row.accountSource == null ? null : canonicalAccountSource(row.accountSource, row.externalOrderId) || null,
    row.platform == null ? null : canonicalAccountSource(row.platform) || null,
    row.outcome,
    row.reason ?? null,
    row.filledFields ?? [],
    row.trackingNumber ?? null,
    row.shipmentId ?? null,
    row.skuCatalogId ?? null,
    row.itemNumber ?? null,
    row.shipstationOrderId ?? null,
    row.shipstationShipmentId ?? null,
    row.sheetTab ?? null,
    row.sheetRow ?? null,
    row.importExceptionId ?? null,
  ];
}

export const importRecordDeps: ImportRecordDeps = {
  async insertRun(orgId, meta) {
    const { rows } = await tenantQuery<{ id: string }>(
      orgId,
      `INSERT INTO order_import_runs
         (organization_id, cron_run_id, kind, trigger, triggered_by_staff_id, status, started_at)
       VALUES ($1, $2, $3, $4, $5, 'running', NOW())
       RETURNING id`,
      [orgId, meta.cronRunId, meta.kind, meta.trigger, meta.staffId],
    );
    return Number(rows[0].id);
  },

  async insertStep(orgId, runId, step, rows) {
    await withTenantTransaction(orgId, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO order_import_run_steps
           (run_id, organization_id, step, ok, counts, error, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
         RETURNING id`,
        [runId, orgId, step.step, step.ok, JSON.stringify(step.counts), step.error, step.startedAt, step.finishedAt],
      );
      const stepId = inserted.rows[0].id;
      for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
        const chunk = rows.slice(start, start + ROWS_PER_INSERT);
        const values: unknown[] = [runId, stepId, orgId, step.step];
        const tuples = chunk.map((row, i) => {
          values.push(...rowValues(row));
          const b = 4 + i * ROW_BINDS;
          const binds = Array.from({ length: ROW_BINDS }, (_, k) => `$${b + k + 1}${k === 6 ? '::text[]' : ''}`);
          return `($1, $2, $3, $4, ${binds.join(', ')})`;
        });
        await client.query(
          `INSERT INTO order_import_run_rows
             (run_id, step_id, organization_id, source,
              order_row_id, external_order_id, account_source, platform, outcome, reason,
              filled_fields, tracking_number, shipment_id, sku_catalog_id, item_number,
              shipstation_order_id, shipstation_shipment_id, sheet_tab, sheet_row, import_exception_id)
           VALUES ${tuples.join(',\n')}`,
          values,
        );
      }
    });
  },

  async finishRun(orgId, runId, finish) {
    await tenantQuery(
      orgId,
      `UPDATE order_import_runs
          SET status = $3,
              counts = $4::jsonb,
              error = $5,
              finished_at = NOW(),
              duration_ms = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000))::int
        WHERE id = $1 AND organization_id = $2`,
      [runId, orgId, finish.status, JSON.stringify(finish.counts), finish.error ? finish.error.slice(0, 2000) : null],
    );
  },

  warn(message, detail) {
    logger.warn(detail, message);
  },
};

/** `syncConnection` (or any provider sync) recorded as its own import run. */
export function recordProviderSyncRun(
  orgId: OrgId,
  provider: string,
  meta: ImportRunMeta,
  sync: () => Promise<SyncOutcome>,
): Promise<SyncOutcome> {
  return recordProviderSync(orgId, provider, meta, sync, importRecordDeps);
}

/**
 * Retention for the cleanup cron: drop each org's runs started before the
 * window (steps and rows cascade). One org failing never stops the rest;
 * before the migration is applied the table is absent and this is a no-op.
 */
export async function pruneImportRuns(retentionDays: number): Promise<number> {
  let deleted = 0;
  for (const orgId of await listSweepOrgIds()) {
    try {
      const res = await tenantQuery(
        orgId,
        `DELETE FROM order_import_runs
          WHERE organization_id = $1
            AND started_at < NOW() - ($2::int * INTERVAL '1 day')`,
        [orgId, retentionDays],
      );
      deleted += res.rowCount ?? 0;
    } catch (err) {
      if ((err as { code?: string } | null)?.code === '42P01') return deleted; // undefined_table
      logger.warn({ orgId, error: err instanceof Error ? err.message : String(err) }, 'import record: prune failed');
    }
  }
  return deleted;
}
