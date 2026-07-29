/**
 * Google Sheets / Ecwid connector sync adapters — wrap the EXISTING
 * transfer-orders job (`runGoogleSheetsTransferOrders`) behind the connector
 * `sync()` contract so the manual "Import Latest Orders" / backfill buttons
 * route through POST /api/integrations/[provider]/sync (INT-020) instead of
 * the legacy streaming endpoints. Lazily imported by the registry so the
 * lightweight connection reader never pulls in the Sheets/Ecwid job code.
 *
 * The NDJSON routes (/api/google-sheets/transfer-orders,
 * /api/ecwid/transfer-orders) stay in place deliberately. They are no longer
 * duplicated logic — after the ingest extraction they only call the job — and
 * they carry two things this non-streaming seam cannot: live per-phase progress
 * during a long sheet import, and the full result detail (unresolved tracking,
 * unmatched catalog, skipped-row breakdown) that the importer UI renders.
 * `SyncOutcome` below reduces all of that to two counters, so routing the
 * importer through here would visibly degrade it. Enriching `SyncOutcome` to
 * carry the detail is the prerequisite for retiring those routes.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import {
  GoogleSheetsTransferOrdersJobError,
  resolveTransferSourceSpreadsheetId,
  runGoogleSheetsTransferOrders,
  type GoogleSheetsTransferOrdersJobResult,
} from '@/lib/jobs/google-sheets-transfer-orders';
import type { SyncOutcome } from './types';

function toOutcome(r: GoogleSheetsTransferOrdersJobResult): SyncOutcome {
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
    const r = await runGoogleSheetsTransferOrders(
      opts?.manualSheetName,
      'sheets',
      undefined,
      orgId,
      spreadsheetId,
    );
    return toOutcome(r);
  } catch (e) {
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
