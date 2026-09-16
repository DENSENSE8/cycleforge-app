/**
 * Google Sheets / Ecwid connector sync adapters — wrap the EXISTING
 * transfer-orders job (`runGoogleSheetsTransferOrders`) behind the connector
 * `sync()` contract so the manual "Import Latest Orders" / backfill buttons
 * route through POST /api/integrations/[provider]/sync (INT-020) instead of
 * the legacy streaming endpoints. Lazily imported by the registry so the
 * lightweight connection reader never pulls in the Sheets/Ecwid job code.
 *
 * The legacy NDJSON routes (/api/google-sheets/transfer-orders,
 * /api/ecwid/transfer-orders) now have NO frontend caller. They were kept for
 * the one thing this seam could not carry — live per-phase progress during a
 * long sheet import — and that hole is closed: `SyncOpts.onProgress` is wired
 * here, and POST /api/integrations/[provider]/sync streams the same phase +
 * per-row events when the caller sends `Accept: application/x-ndjson`. Their
 * last consumer (`useOrdersImport`, behind the dashboard sidebar's unreachable
 * import card) was deleted 2026-09-15. What remains is job-only surface;
 * retiring the routes is its own increment, not a side effect of this file.
 *
 * RESOLVED (2026-07-29) — result DETAIL is no longer the other gap. This header
 * used to warn that `SyncOutcome` "reduces all of that to two counters, so
 * routing the importer through here would visibly degrade it", and naming
 * enrichment as the prerequisite for retiring those routes. The chrome popover
 * (OrdersSyncPopover → useOrdersSync) was routed here anyway, before that work
 * landed — so the sidebar's progress dialog, whose entire body was the per-row
 * inserted / updated / unmatched-catalog lists, rendered blank for every run,
 * and a sheet whose rows were all skipped for a blank Item Number looked
 * exactly like an up-to-date one. `SyncOutcome` now carries `details` + `stats`
 * (the skip breakdown), and `toOutcome` passes both through.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import {
  GoogleSheetsTransferOrdersJobError,
  resolveTransferSourceSpreadsheetId,
  runGoogleSheetsTransferOrders,
} from '@/lib/jobs/google-sheets-transfer-orders';
import type { SyncOpts, SyncOutcome } from './types';

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

/**
 * Google Sheets order import (source = the org's configured spreadsheet).
 *
 * `opts.onProgress` is the live per-phase sink. It was the missing third
 * argument below: the job has always emitted `fetching_sheet` →
 * `resolving_tracking` → `matching_orders` → `updating` → `inserting` →
 * `publishing` with counts, and this adapter threw all of it away.
 */
export async function googleSheetsSync(
  orgId: OrgId,
  opts?: SyncOpts,
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
      opts?.onProgress,
      orgId,
      spreadsheetId,
    );
    return toOutcome(r);
  } catch (e) {
    return toError(e);
  }
}

/** Ecwid Direct order import (Ecwid API rows only; no sheet read). */
export async function ecwidSync(orgId: OrgId, opts?: SyncOpts): Promise<SyncOutcome> {
  try {
    const r = await runGoogleSheetsTransferOrders(
      undefined,
      'ecwid',
      opts?.onProgress,
      orgId,
    );
    return toOutcome(r);
  } catch (e) {
    return toError(e);
  }
}
