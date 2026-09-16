import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// Import the dependency-free sibling, NOT orders-transfer.ts — that module
// reaches @/lib/db (server-only) through the transfer job and cannot load here.
import { toOutcome } from './orders-transfer-outcome';
import type { GoogleSheetsTransferOrdersJobResult } from '@/lib/jobs/google-sheets-transfer-orders';

/**
 * Regression: the Sheets importer reported an empty body for every run.
 *
 * The per-row record is drawn entirely from `details` (inserted / updated /
 * unmatchedCatalog row lists) — today `buildSyncRunDetail`, then the deleted
 * `OrderSyncDialog`. When the chrome popover was routed through the connector
 * seam, this mapping reduced the job result to two counters — so that surface
 * had nothing to draw, and a sheet whose rows were ALL skipped looked
 * identical to an already-up-to-date sheet ("0 / 0 / no changes").
 *
 * These assertions pin the passthrough that the orders-transfer.ts header
 * called "the prerequisite for retiring those routes".
 */

function jobResult(
  over: Partial<GoogleSheetsTransferOrdersJobResult> = {},
): GoogleSheetsTransferOrdersJobResult {
  return {
    success: true,
    rowCount: 120,
    processedRows: 40,
    insertedOrders: 3,
    updatedOrdersTracking: 2,
    updatedOrdersFields: 5,
    unresolvedTrackingCount: 1,
    deletedDuplicateOrders: 0,
    matchedCustomers: 0,
    unmatchedCustomers: 0,
    tabName: 'Sheet_01_14_2026',
    durationMs: 1234,
    skippedNoItemNumber: 80,
    skippedNoTracking: 0,
    skippedNoOrderId: 0,
    skippedEcwid: 0,
    details: {
      inserted: [{ orderId: 'A-1' }],
      updated: [],
      deleted: [],
      unknownTitle: [],
      unresolvedTracking: [],
      unmatchedCatalog: [{ orderId: 'A-2' }],
    },
    ...over,
  } as GoogleSheetsTransferOrdersJobResult;
}

describe('google sheets connector → SyncOutcome', () => {
  it('passes the per-row detail through instead of dropping it', () => {
    const out = toOutcome(jobResult());
    const details = out.details as Record<string, unknown[]>;

    assert.ok(details, 'details must survive the mapping');
    assert.equal(details.inserted.length, 1);
    assert.equal(details.unmatchedCatalog.length, 1);
  });

  it('carries the skip breakdown so a fully-skipped run is not silent', () => {
    // The exact shape of the user-visible bug: nothing imported, nothing
    // updated — but for a REASON the panel must be able to state.
    const out = toOutcome(
      jobResult({ insertedOrders: 0, updatedOrdersFields: 0, updatedOrdersTracking: 0 }),
    );

    assert.equal(out.imported, 0);
    assert.equal(out.updated, 0);
    // Without this, "every row skipped" is indistinguishable from "up to date".
    assert.equal(out.stats?.skippedNoItemNumber, 80);
    assert.equal(out.stats?.rowCount, 120);
  });

  it('still reports the two counters the summary line is built from', () => {
    const out = toOutcome(jobResult());
    assert.equal(out.ok, true);
    assert.equal(out.imported, 3);
    // Field updates + tracking attaches both count as "updated".
    assert.equal(out.updated, 7);
  });
});
