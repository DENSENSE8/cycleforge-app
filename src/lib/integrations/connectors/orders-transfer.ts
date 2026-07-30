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
 * they still carry one thing this non-streaming seam cannot: live per-phase
 * progress during a long sheet import.
 *
 * RESOLVED (2026-07-29) — result DETAIL is no longer the other gap. This header
 * used to warn that `SyncOutcome` "reduces all of that to two counters, so
 * routing the importer through here would visibly degrade it", and naming
 * enrichment as the prerequisite for retiring those routes. The chrome popover
 * (OrdersSyncPopover → useOrdersSync) was routed here anyway, before that work
 * landed — so OrderSyncDialog, whose entire body is the per-row inserted /
 * updated / unmatched-catalog lists, rendered blank for every run, and a sheet
 * whose rows were all skipped for a blank Item Number looked exactly like an
 * up-to-date one. `SyncOutcome` now carries `details` + `stats` (the skip
 * breakdown), and `toOutcome` passes both through. Live-progress streaming is
 * the only remaining reason those routes exist.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import {
  GoogleSheetsTransferOrdersJobError,
  resolveTransferSourceSpreadsheetId,
  runGoogleSheetsTransferOrders,
} from '@/lib/jobs/google-sheets-transfer-orders';
import type { SyncOutcome } from './types';

// The pure job-result → SyncOutcome mapping lives in a dependency-free sibling
// so it stays importable from a unit test: this module reaches `@/lib/db` (and
// its `server-only` guard) through the transfer job, which makes anything
// beside it unloadable outside a server context. Bundle-altitude recipe from
// build-gotchas.md.
import { toOutcome } from './orders-transfer-outcome';

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
