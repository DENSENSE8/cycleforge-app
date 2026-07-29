/**
 * Transfer-orders job — the Google Sheets reader, and the orchestrator that
 * feeds Sheets + Ecwid into the shared order-ingest writer.
 *
 * This file used to be the entire ingest pipeline (~1,400 lines): sheet
 * reading, Ecwid fetching, catalog hydration, shipment linking, dedupe,
 * deadlines, cache busting. Everything that was not Sheets-specific now lives
 * in `@/lib/orders/ingest-canonical-orders` so a second source can reuse it,
 * and the Ecwid path maps its own JSON to `CanonicalOrderLine[]` instead of
 * synthesizing spreadsheet-shaped positional arrays.
 *
 * What remains here: reading the sheet, picking the tab, binding headers, and
 * translating the job's public result shape (which the streaming NDJSON routes
 * and the importer UI both consume) from the writer's result.
 */
import { sheets as googleSheets } from '@googleapis/sheets';
import { getGoogleAuth } from '@/lib/google-auth';
import { transitionalDogfoodOrgId } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  getIntegrationCredentials,
  type EcwidCredentials,
  type GoogleSheetsCredentials,
} from '@/lib/integrations/credentials';
import { isPlanFeatureExemptOrg } from '@/lib/billing/plan-feature-gate';
import type { CanonicalOrderLine } from '@/lib/orders/canonical-order';
import { ingestCanonicalOrders } from '@/lib/orders/ingest-canonical-orders';
import { fetchEcwidCanonicalOrders } from '@/lib/orders/sources/ecwid-orders';
import {
  bindSheetColumns,
  mapSheetRowsToCanonicalLines,
  type SheetRow,
} from '@/lib/orders/sources/google-sheet-rows';
import type { SyncProgress, TransferOrderDetails } from '@/lib/orders-sync/types';
import {
  emptyTransferSheetSkipCounts,
  filterEligibleTransferSheetRows,
  type TransferSheetSkipCounts,
} from '@/lib/jobs/transfer-sheet-eligibility';

export type { TransferOrderDetail, TransferOrderDetails } from '@/lib/orders-sync/types';

/**
 * USAV's hardcoded source sheet — the transitional default used when no per-org
 * spreadsheet id is supplied. USAV connects Google via env service-account creds
 * (GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY) and has no organization_integrations
 * `google_sheets` row to read an id from, so this stays its source. Exported so
 * the cron fan-out can use it as USAV's includeDogfoodTransitional source while
 * every OTHER org supplies its OWN id from its google_sheets integration config.
 * A non-USAV caller MUST pass an explicit id — never default another tenant onto
 * USAV's sheet.
 */
export const DOGFOOD_SOURCE_SPREADSHEET_ID = '1b8uvgk4q7jJPjGvFM2TQs3vMES1o9MiAfbEJ7P1TW9w';

/**
 * The transfer source sheet for `orgId`, or null to skip the org.
 *
 * USAV keeps its hardcoded sheet (env service-account creds, no per-org row).
 * Every OTHER org must supply its OWN id via its google_sheets integration
 * config; an org with the provider connected but NO configured sheet id returns
 * null and is skipped — we never default a tenant onto USAV's sheet.
 */
export async function resolveTransferSourceSpreadsheetId(orgId: OrgId): Promise<string | null> {
  if (orgId === transitionalDogfoodOrgId()) return DOGFOOD_SOURCE_SPREADSHEET_ID;
  const creds = await getIntegrationCredentials<GoogleSheetsCredentials>(orgId, 'google_sheets');
  const id = creds?.defaultSpreadsheetId?.trim();
  return id || null;
}

export class GoogleSheetsTransferOrdersJobError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(String(body.error || body.message || 'Google Sheets transfer failed'));
    this.status = status;
    this.body = body;
  }
}

function fail(status: number, error: string): never {
  throw new GoogleSheetsTransferOrdersJobError(status, { success: false, error });
}

function failJson(status: number, body: Record<string, unknown>): never {
  throw new GoogleSheetsTransferOrdersJobError(status, body);
}

/** No-op progress callback used when streaming isn't needed. */
const noopProgress: SyncProgress = () => {};

export interface GoogleSheetsTransferOrdersJobResult {
  success: true;
  rowCount: number;
  processedRows: number;
  insertedOrders: number;
  updatedOrdersTracking: number;
  updatedOrdersFields: number;
  /** Rows whose source tracking value failed carrier detection (not linked). */
  unresolvedTrackingCount: number;
  deletedDuplicateOrders: number;
  matchedCustomers: number;
  unmatchedCustomers: number;
  tabName: string;
  ecwidApiRows?: number;
  skippedRows?: number;
  /** Sheet-path eligibility skips (raw Item Number / tracking / order id / Ecwid). */
  skippedNoOrderId?: number;
  skippedNoTracking?: number;
  skippedNoItemNumber?: number;
  skippedEcwid?: number;
  durationMs: number;
  details: TransferOrderDetails;
}

export type TransferOrdersSource = 'sheets' | 'ecwid' | 'all';

interface SheetFetchResult {
  tabName: string;
  lines: CanonicalOrderLine[];
  totalRows: number;
  skips: TransferSheetSkipCounts;
}

/** Newest `Sheet_MM_DD_YYYY` tab, or the explicitly named one. */
function pickTargetTab(tabTitles: string[], manualSheetName?: string): string {
  if (manualSheetName && manualSheetName.trim() !== '') {
    const wanted = manualSheetName.trim();
    if (!tabTitles.includes(wanted)) fail(404, `Sheet tab "${wanted}" not found in source spreadsheet`);
    return wanted;
  }

  const dateTabs = tabTitles
    .filter((title) => title.startsWith('Sheet_'))
    .map((title) => {
      const parts = title.split('_');
      if (parts.length < 4) return { title, date: new Date(0) };
      const [, mm, dd, yyyy] = parts;
      return { title, date: new Date(Number(yyyy), Number(mm) - 1, Number(dd)) };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (dateTabs.length === 0) fail(404, 'No valid sheet tabs found in source');
  return dateTabs[0].title;
}

async function fetchSheetLines(
  sourceSpreadsheetId: string,
  manualSheetName: string | undefined,
  progress: SyncProgress,
): Promise<SheetFetchResult> {
  progress({ type: 'phase', phase: 'fetching_sheet' });
  const sheets = googleSheets({ version: 'v4', auth: getGoogleAuth() });
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sourceSpreadsheetId });
  const tabTitles = (spreadsheet.data.sheets || []).map((sheet) => sheet.properties?.title || '');
  const tabName = pickTargetTab(tabTitles, manualSheetName);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sourceSpreadsheetId,
    range: `${tabName}!A1:Z`,
  });

  const sourceRows = (response.data.values || []) as SheetRow[];
  if (sourceRows.length < 2) fail(404, 'No data found in source tab');

  const headerRow = sourceRows[0] as unknown[];
  const { colIndices, missing } = bindSheetColumns(headerRow);
  if (missing.length > 0) {
    const headersReceived = headerRow.map((cell) => String(cell ?? '').trim());
    const missingExplain = missing
      .map((b) => `"${b.field}" needs a column titled one of: ${b.candidates.map((c) => `"${c}"`).join(', ')}`)
      .join('; ');
    const receivedExplain = headersReceived
      .map((text, i) => `${i + 1}:${text === '' ? '(blank)' : `"${text}"`}`)
      .join(', ');
    failJson(400, {
      success: false,
      error: `Missing required sheet header(s): ${missingExplain}. Headers found in row 1 (${headersReceived.length} cells): ${receivedExplain}`,
      missingColumns: missing.map((b) => ({ field: b.field, expectedLabels: b.candidates })),
      headersReceived,
    });
  }

  // Gate on the RAW sheet Item Number (not catalog title-match backfill) so
  // unlinkable blank-item_number trash never lands in orders.
  const filtered = filterEligibleTransferSheetRows(sourceRows.slice(1), {
    orderNumber: colIndices.orderNumber,
    tracking: colIndices.tracking,
    itemNumber: colIndices.itemNumber,
    platform: colIndices.platform,
  });

  return {
    tabName,
    lines: mapSheetRowsToCanonicalLines(filtered.eligible, colIndices),
    totalRows: sourceRows.length - 1,
    skips: filtered.skips,
  };
}

/**
 * Ecwid is a non-fatal leg: a credential or API failure degrades that source to
 * zero rows and lets the sheet path still land. It must never fail the run.
 */
async function fetchEcwidLines(effectiveOrgId: OrgId, progress: SyncProgress): Promise<CanonicalOrderLine[]> {
  progress({ type: 'phase', phase: 'fetching_ecwid' });
  try {
    const vault = await getIntegrationCredentials<EcwidCredentials>(effectiveOrgId, 'ecwid');
    return await fetchEcwidCanonicalOrders(
      vault?.storeId && vault?.apiToken ? { storeId: vault.storeId, token: vault.apiToken } : undefined,
      { allowEnvFallback: isPlanFeatureExemptOrg(effectiveOrgId) },
    );
  } catch (err: any) {
    console.error('[transfer-orders] Ecwid API fetch failed (non-fatal):', err?.message);
    return [];
  }
}

export async function runGoogleSheetsTransferOrders(
  manualSheetName?: string,
  source: TransferOrdersSource = 'all',
  progress: SyncProgress = noopProgress,
  orgId?: OrgId,
  // Which Google Sheet to read. Defaults to USAV's hardcoded sheet so existing
  // (USAV-context) callers are byte-identical. The per-org cron fan-out passes
  // each org's OWN sheet id so a tenant is never read from another tenant's sheet.
  sourceSpreadsheetId: string = DOGFOOD_SOURCE_SPREADSHEET_ID,
): Promise<GoogleSheetsTransferOrdersJobResult> {
  const startedAt = Date.now();
  const effectiveOrgId: OrgId = orgId ?? transitionalDogfoodOrgId();

  progress({ type: 'phase', phase: 'starting' });

  try {
    const sheet =
      source === 'ecwid'
        ? null
        : await fetchSheetLines(sourceSpreadsheetId, manualSheetName, progress);
    const ecwidLines = source === 'sheets' ? [] : await fetchEcwidLines(effectiveOrgId, progress);

    const tabName = sheet?.tabName ?? '(ecwid-api)';
    const skips = sheet?.skips ?? emptyTransferSheetSkipCounts();
    const lines = [...(sheet?.lines ?? []), ...ecwidLines];

    if (lines.length === 0) {
      progress({ type: 'phase', phase: 'done' });
      return {
        success: true,
        rowCount: 0,
        processedRows: 0,
        insertedOrders: 0,
        updatedOrdersTracking: 0,
        updatedOrdersFields: 0,
        unresolvedTrackingCount: 0,
        deletedDuplicateOrders: 0,
        matchedCustomers: 0,
        unmatchedCustomers: 0,
        tabName,
        ecwidApiRows: ecwidLines.length,
        skippedRows: sheet?.totalRows ?? 0,
        ...skips,
        durationMs: Date.now() - startedAt,
        details: {
          inserted: [],
          updated: [],
          deleted: [],
          unknownTitle: [],
          unresolvedTracking: [],
          unmatchedCatalog: [],
        },
      };
    }

    const result = await ingestCanonicalOrders(lines, {
      orgId,
      source: 'google-sheets-transfer-orders',
      progress,
    });
    progress({ type: 'phase', phase: 'done' });

    return {
      success: true,
      rowCount: result.insertedOrders,
      processedRows: result.processedOrders,
      insertedOrders: result.insertedOrders,
      updatedOrdersTracking: result.updatedOrdersTracking,
      updatedOrdersFields: result.updatedOrdersFields,
      unresolvedTrackingCount: result.unresolvedTrackingCount,
      deletedDuplicateOrders: result.deletedDuplicateOrders,
      matchedCustomers: result.matchedCustomers,
      unmatchedCustomers: result.unmatchedCustomers,
      tabName,
      ecwidApiRows: ecwidLines.length,
      ...skips,
      durationMs: Date.now() - startedAt,
      details: result.details,
    };
  } catch (error: any) {
    if (error instanceof GoogleSheetsTransferOrdersJobError) throw error;
    console.error('[google-sheets-transfer-orders]', error);
    throw new GoogleSheetsTransferOrdersJobError(500, {
      success: false,
      error: error?.message || 'Internal Server Error',
    });
  }
}
