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
  evaluateTransferSheetRowEligibility,
  filterEligibleTransferSheetRows,
  type TransferSheetSkipCounts,
  type TransferSheetSkippedRow,
} from '@/lib/jobs/transfer-sheet-eligibility';
import {
  batchResolveListingsByTitle,
  listingTitleMatchKey,
} from '@/lib/neon/sku-catalog-queries';
import { enqueueImportExceptionsForImport } from '@/lib/inventory/order-import-exceptions';

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
  skippedBlankRow?: number;
  skippedFbaShipment?: number;
  skippedNoOrderId?: number;
  skippedNoTracking?: number;
  skippedNoItemNumber?: number;
  skippedEcwid?: number;
  /**
   * The skipped rows themselves (capped, blank padding excluded) so the
   * importer UI can show WHICH orders were dropped and why, instead of a
   * number the operator cannot act on.
   */
  skippedRowDetails?: TransferSheetSkippedRow[];
  /**
   * Rows that WOULD have been skipped for a blank Item Number but were revived
   * by an exact listing-title match. Surfaced so the recovery is auditable
   * rather than silent — an operator should be able to see which listing id
   * the import inferred, and for which order.
   */
  recoveredByTitle?: number;
  recoveredRowDetails?: TransferSheetSkippedRow[];
  durationMs: number;
  details: TransferOrderDetails;
}

export type TransferOrdersSource = 'sheets' | 'ecwid' | 'all';

interface SheetFetchResult {
  tabName: string;
  lines: CanonicalOrderLine[];
  totalRows: number;
  skips: TransferSheetSkipCounts;
  skippedRows: TransferSheetSkippedRow[];
  /** Rows whose blank Item Number was filled from an exact listing-title match. */
  recoveredRows: TransferSheetSkippedRow[];
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

/**
 * Fill a blank Item Number from an EXACT existing listing title, before the
 * eligibility gate sees the row.
 *
 * The gate's rule ("raw Item Number or the row is trash") was written against
 * FUZZY catalog title-matching, which can only name a product and then has to
 * guess which of its listings the order came from. This resolves the LISTING
 * itself by exact title, and refuses on ambiguity — so a row is only revived
 * when its actual `platform_item_id` is already in the crosswalk. That keeps
 * the gate's intent (nothing unlinkable lands in orders) while recovering the
 * ~60% of blank rows whose listing we demonstrably already know.
 *
 * Only `noItemNumber` rows are candidates: blank padding, FBA shipments, Ecwid
 * rows and rows missing an order id or tracking stay skipped for their own
 * reasons and are never resurrected here.
 */
async function backfillItemNumbersFromListingTitles(
  dataRows: SheetRow[],
  colIndices: ReturnType<typeof bindSheetColumns>['colIndices'],
  orgId: OrgId,
): Promise<{ rows: SheetRow[]; recovered: TransferSheetSkippedRow[] }> {
  const gateCols = {
    orderNumber: colIndices.orderNumber,
    tracking: colIndices.tracking,
    itemNumber: colIndices.itemNumber,
    platform: colIndices.platform,
    itemTitle: colIndices.itemTitle,
  };
  const readCell = (row: SheetRow, index: number) =>
    index < 0 ? '' : String(row[index] ?? '').trim();

  const candidates: Array<{ index: number; title: string; platform: string }> = [];
  dataRows.forEach((row, index) => {
    if (evaluateTransferSheetRowEligibility(row, gateCols) !== 'noItemNumber') return;
    const title = readCell(row, colIndices.itemTitle);
    if (!title) return;
    candidates.push({ index, title, platform: readCell(row, colIndices.platform) });
  });

  if (candidates.length === 0 || colIndices.itemNumber < 0) {
    return { rows: dataRows, recovered: [] };
  }

  const matches = await batchResolveListingsByTitle(
    candidates.map(({ title, platform }) => ({ title, platform })),
    orgId,
  );

  // Copy-on-write: only the rows that actually resolve are replaced, so the
  // caller's array is never mutated under it.
  const rows = dataRows.slice();
  const recovered: TransferSheetSkippedRow[] = [];

  for (const { index, title, platform } of candidates) {
    const match = matches.get(listingTitleMatchKey(title, platform));
    if (!match?.platformItemId) continue;
    const next = rows[index].slice() as SheetRow;
    next[colIndices.itemNumber] = match.platformItemId;
    rows[index] = next;
    recovered.push({
      sheetRow: index + 2,
      reason: 'noItemNumber',
      orderId: readCell(rows[index], colIndices.orderNumber),
      platform,
      productTitle: title,
      tracking: readCell(rows[index], colIndices.tracking),
    });
  }

  return { rows, recovered };
}

async function fetchSheetLines(
  sourceSpreadsheetId: string,
  manualSheetName: string | undefined,
  progress: SyncProgress,
  orgId: OrgId,
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

  // Recover a blank Item Number from an EXACT existing listing title first —
  // see backfillItemNumbersFromListingTitles. Anything it cannot resolve
  // unambiguously stays blank and is dropped by the gate below, which still
  // reads the RAW cell: fuzzy catalog title-matching must never resurrect a row.
  const { rows: dataRows, recovered } = await backfillItemNumbersFromListingTitles(
    sourceRows.slice(1),
    colIndices,
    orgId,
  );

  const filtered = filterEligibleTransferSheetRows(dataRows, {
    orderNumber: colIndices.orderNumber,
    tracking: colIndices.tracking,
    itemNumber: colIndices.itemNumber,
    platform: colIndices.platform,
    // Title is display-only here — it is what makes a skipped row recognizable
    // to the operator who has to go fix it.
    itemTitle: colIndices.itemTitle,
  });

  // Durable Review · Missing item number queue (`/review?mode=catalog-link`).
  // Use the uncapped `noItemNumberRows` list — NOT the dialog's capped
  // `skippedRows` sample — so every blank-Item-Number sale reaches Review.
  if (filtered.noItemNumberRows.length > 0) {
    await enqueueImportExceptionsForImport(
      orgId,
      filtered.noItemNumberRows.map((skipped) => ({
        accountOrderId: skipped.orderId,
        accountSource: skipped.platform,
        productTitle: skipped.productTitle,
        tracking: skipped.tracking,
        sheetRow: skipped.sheetRow,
        // `filterEligibleTransferSheetRows` numbers rows as `firstSheetRow +
        // index` with firstSheetRow defaulting to 2 (dataRows = sourceRows
        // minus the header) — so the raw row lives back at `sheetRow - 2`.
        rawRow: dataRows[skipped.sheetRow - 2] ?? [],
        colIndices,
      })),
    ).catch((err) => {
      // Best-effort: a failure here must never fail the sheet import itself.
      console.error('[transfer-orders] enqueueImportExceptionsForImport failed (non-fatal):', err);
    });
  }

  return {
    tabName,
    lines: mapSheetRowsToCanonicalLines(filtered.eligible, colIndices),
    totalRows: sourceRows.length - 1,
    skips: filtered.skips,
    skippedRows: filtered.skippedRows,
    recoveredRows: recovered,
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
        : await fetchSheetLines(sourceSpreadsheetId, manualSheetName, progress, effectiveOrgId);
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
        skippedRowDetails: sheet?.skippedRows ?? [],
        recoveredByTitle: sheet?.recoveredRows?.length ?? 0,
        recoveredRowDetails: sheet?.recoveredRows ?? [],
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
      // Rows READ from the sheet tab — not a second copy of insertedOrders,
      // which is what this used to return. That made the field report 0 on any
      // run that inserted nothing, so "we read 46 rows and imported none of
      // them" was indistinguishable from "the sheet was empty".
      rowCount: sheet?.totalRows ?? 0,
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
      // Total rows the eligibility gate dropped. Only the zero-line early
      // return used to set this, so the normal path reported `skippedRows: 0`
      // while the per-reason counters beside it were non-zero.
      // Sum EVERY reason. Derived by hand, this drifts the moment a category is
      // added — adding `fbaShipment` without touching this line made the total
      // under-report by 4 on the very first live run.
      skippedRows: Object.values(skips).reduce((sum, n) => sum + n, 0),
      skippedRowDetails: sheet?.skippedRows ?? [],
      recoveredByTitle: sheet?.recoveredRows?.length ?? 0,
      recoveredRowDetails: sheet?.recoveredRows ?? [],
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
