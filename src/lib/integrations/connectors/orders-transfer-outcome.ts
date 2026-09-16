/**
 * Pure job-result → SyncOutcome mapping for the Sheets/Ecwid connectors.
 *
 * Dependency-free ON PURPOSE (bundle altitude —):
 * `orders-transfer.ts` imports the transfer job, which reaches `@/lib/db` and
 * its `server-only` guard, so anything living beside it is unimportable from a
 * test or a client. Only the TYPE is imported here, and types erase at runtime.
 * `orders-transfer.ts` re-exports this so server callers keep their import path.
 */
import type { GoogleSheetsTransferOrdersJobResult } from '@/lib/jobs/google-sheets-transfer-orders';
import type { SyncOutcome } from './types';

/**
 * What this mapping drops, no import surface can draw.
 *
 * The run's per-row record (`buildSyncRunDetail` → OrderSyncRunDetailSheet, and
 * before it the deleted `OrderSyncDialog`) is built entirely from `details` —
 * the inserted / updated / unmatched-catalog row lists. This used to return
 * only `ok`, `imported` and `updated`, so once the chrome popover was routed
 * through the connector seam that surface went blank for every run — and a
 * sheet whose rows were all skipped became indistinguishable from an
 * up-to-date one.
 */
export function toOutcome(r: GoogleSheetsTransferOrdersJobResult): SyncOutcome {
  return {
    ok: true,
    imported: r.insertedOrders,
    // Field updates + tracking attaches both count as "updated" rows.
    updated: r.updatedOrdersFields + r.updatedOrdersTracking,
    // `details` is the ingested-row story; `skippedRows` is the NOT-ingested
    // one. Both are needed: an import that moves nothing is fully explained
    // only by the rows it declined and why.
    details: {
      ...r.details,
      skippedRows: r.skippedRowDetails ?? [],
      recoveredRows: r.recoveredRowDetails ?? [],
    },
    stats: {
      rowCount: r.rowCount,
      processedRows: r.processedRows,
      insertedOrders: r.insertedOrders,
      updatedOrdersFields: r.updatedOrdersFields,
      updatedOrdersTracking: r.updatedOrdersTracking,
      deletedDuplicateOrders: r.deletedDuplicateOrders,
      unresolvedTrackingCount: r.unresolvedTrackingCount,
      // The "why did nothing import" story. A sheet whose rows are all skipped
      // for a blank Item Number is otherwise indistinguishable from an
      // already-up-to-date sheet — both render 0 / 0 / "no changes".
      skippedRows: r.skippedRows ?? 0,
      skippedBlankRow: r.skippedBlankRow ?? 0,
      skippedFbaShipment: r.skippedFbaShipment ?? 0,
      skippedNoOrderId: r.skippedNoOrderId ?? 0,
      skippedNoTracking: r.skippedNoTracking ?? 0,
      skippedNoItemNumber: r.skippedNoItemNumber ?? 0,
      skippedEcwid: r.skippedEcwid ?? 0,
      recoveredByTitle: r.recoveredByTitle ?? 0,
    },
  };
}
