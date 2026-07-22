/**
 * Google Sheets / Ecwid connector sync adapters — wrap the EXISTING
 * transfer-orders job (`runGoogleSheetsTransferOrders`) behind the connector
 * `sync()` contract so the manual "Import Latest Orders" / backfill buttons
 * route through POST /api/integrations/[provider]/sync (INT-020) instead of
 * the legacy streaming endpoints. Lazily imported by the registry so the
 * lightweight connection reader never pulls in the Sheets/Ecwid job code.
 *
 * The legacy NDJSON routes (/api/google-sheets/transfer-orders,
 * /api/ecwid/transfer-orders) stay in place — the cron fan-out and the legacy
 * DashboardManagementPanel importer still stream through them.
 */
import { appendFileSync } from 'node:fs';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  GoogleSheetsTransferOrdersJobError,
  resolveTransferSourceSpreadsheetId,
  runGoogleSheetsTransferOrders,
  type GoogleSheetsTransferOrdersJobResult,
} from '@/lib/jobs/google-sheets-transfer-orders';
import type { SyncOutcome } from './types';

const DEBUG_LOG = '/Users/icecube/repos/cycleforge-app/.cursor/debug-7d3d46.log';
function debugLog(payload: Record<string, unknown>) {
  // #region agent log
  try {
    appendFileSync(DEBUG_LOG, `${JSON.stringify({ sessionId: '7d3d46', timestamp: Date.now(), ...payload })}\n`);
  } catch {
    /* ignore debug log IO */
  }
  // #endregion
}

function toOutcome(r: GoogleSheetsTransferOrdersJobResult): SyncOutcome {
  debugLog({
    runId: 'pre-fix',
    hypothesisId: 'B,D',
    location: 'orders-transfer.ts:toOutcome',
    message: 'job result stripped to SyncOutcome counts only',
    data: {
      tabName: r.tabName,
      rowCount: r.rowCount,
      processedRows: r.processedRows,
      insertedOrders: r.insertedOrders,
      updatedOrdersFields: r.updatedOrdersFields,
      updatedOrdersTracking: r.updatedOrdersTracking,
      detailsInserted: r.details?.inserted?.length ?? 0,
      detailsUpdated: r.details?.updated?.length ?? 0,
      detailsDeleted: r.details?.deleted?.length ?? 0,
      strippingDetails: true,
    },
  });
  return {
    ok: true,
    imported: r.insertedOrders,
    // Field updates + tracking attaches both count as "updated" rows.
    updated: r.updatedOrdersFields + r.updatedOrdersTracking,
  };
}

function toError(e: unknown): SyncOutcome {
  if (e instanceof GoogleSheetsTransferOrdersJobError) {
    const body = e.body as { error?: string };
    return { ok: false, error: body?.error || 'Transfer failed' };
  }
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

/** Google Sheets order import (source = the org's configured spreadsheet). */
export async function googleSheetsSync(
  orgId: OrgId,
  opts?: { manualSheetName?: string },
): Promise<SyncOutcome> {
  const spreadsheetId = await resolveTransferSourceSpreadsheetId(orgId);
  if (!spreadsheetId) {
    return {
      ok: false,
      error:
        'No Google Sheets source configured for this organization. Connect Google Sheets under Settings → Integrations.',
    };
  }
  try {
    debugLog({
      runId: 'pre-fix',
      hypothesisId: 'C,E',
      location: 'orders-transfer.ts:googleSheetsSync:start',
      message: 'googleSheetsSync start',
      data: {
        orgId,
        spreadsheetIdSuffix: spreadsheetId.slice(-8),
        manualSheetName: opts?.manualSheetName ?? null,
      },
    });
    const r = await runGoogleSheetsTransferOrders(
      opts?.manualSheetName,
      'sheets',
      undefined,
      orgId,
      spreadsheetId,
    );
    return toOutcome(r);
  } catch (e) {
    debugLog({
      runId: 'pre-fix',
      hypothesisId: 'C,D',
      location: 'orders-transfer.ts:googleSheetsSync:error',
      message: 'googleSheetsSync failed',
      data: {
        error: e instanceof Error ? e.message : String(e),
        status: (e as { status?: number })?.status ?? null,
        bodyError: (e as { body?: { error?: string } })?.body?.error ?? null,
      },
    });
    return toError(e);
  }
}

/** Ecwid Direct order import (Ecwid API rows only; no sheet read). */
export async function ecwidSync(orgId: OrgId): Promise<SyncOutcome> {
  try {
    const r = await runGoogleSheetsTransferOrders(undefined, 'ecwid', undefined, orgId);
    return toOutcome(r);
  } catch (e) {
    return toError(e);
  }
}
