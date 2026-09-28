/**
 * Google Sheets order backfill — the legacy daily sheet as a second order
 * source beside ShipStation.
 *
 * Staff keep one `Sheet_MM_DD_YYYY` tab per day: every sale, including the
 * labels bought outside ShipStation, with its tracking. A run reads the tabs in
 * scope (rolling 7 days; `full` = every tab, for the one-time history
 * backfill), and lands every row through the SAME writer ShipStation uses —
 * `ingestCanonicalOrders` in aggregator mode:
 *  - an order already in CycleForge under one platform is ADOPTED: the sheet
 *    fills its blanks only (item #, SKU, condition, qty, notes, ship-by, price,
 *    tracking) and never overwrites what ShipStation or an operator set;
 *  - an order number sitting under two platforms is left alone (ambiguous);
 *  - an order nobody has yet is INSERTED (owner 2026-09-28) — and ShipStation
 *    adopts that row the same way when it later imports the order.
 * Nothing is ever deleted (`collapseDuplicates: false`).
 */
import type { sheets_v4 } from '@googleapis/sheets';
import type { OrgId } from '@/lib/tenancy/constants';
import type { GoogleSheetsCredentials } from '@/lib/integrations/credentials';
import type { CanonicalOrderLine } from '@/lib/orders/canonical-order';
import { cleanText } from '@/lib/orders/canonical-order';
import type { PlatformOf } from '@/lib/orders/order-source-match';
import type { IngestCanonicalOrdersResult } from '@/lib/orders/ingest-canonical-orders';
import {
  bindSheetColumns,
  mapSheetRowsToCanonicalLines,
  type SheetColumnIndices,
  type SheetRow,
} from '@/lib/orders/sources/google-sheet-rows';
import type { SyncProgress } from '@/lib/orders-sync/types';
import type { SyncOpts, SyncOutcome } from './types';

/** Rolling scope of a scheduled run — matches ShipStation's import scope. */
export const SHEET_BACKFILL_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Provenance on shipment links / allocation. */
const SOURCE = 'google_sheets';

/**
 * An Amazon INBOUND FBA shipment id (`FBA19KD6XX28`) — one row per box, not a
 * sale. Marketplace order numbers never take this shape.
 */
const FBA_SHIPMENT_ID = /^FBA[0-9A-Z]{6,}$/i;

export class SheetBackfillError extends Error {}

interface DailyTab {
  title: string;
  /** UTC midnight of the tab's date. */
  at: number;
}

/**
 * The `Sheet_MM_DD_YYYY` tabs a run reads, oldest first (so a later tab's row
 * for the same order is the one that wins the dedupe).
 */
export function pickBackfillTabs(
  tabTitles: readonly string[],
  opts: { full?: boolean; now?: number } = {},
): string[] {
  const dated: DailyTab[] = [];
  for (const title of tabTitles) {
    const m = /^Sheet_(\d{1,2})_(\d{1,2})_(\d{4})$/.exec(title.trim());
    if (m) dated.push({ title, at: Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])) });
  }
  const now = opts.now ?? Date.now();
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const since = today - SHEET_BACKFILL_WINDOW_DAYS * DAY_MS;
  return dated
    .filter((t) => opts.full || t.at >= since)
    .sort((a, b) => a.at - b.at)
    .map((t) => t.title);
}

export interface SheetSkipCounts {
  fbaShipment: number;
  noOrderId: number;
  noTracking: number;
  /** The same row pasted again (same tab or a later one). */
  duplicate: number;
}

/**
 * Gate + dedupe rows from every tab in scope into one list of eligible rows.
 * A row needs an order number and a tracking — a trackless row used to land as
 * a label-less order waiting on nothing.
 */
export function collectEligibleRows(
  tabs: ReadonlyArray<{ rows: readonly SheetRow[]; cols: SheetColumnIndices }>,
): { rows: Array<{ row: SheetRow; cols: SheetColumnIndices }>; skips: SheetSkipCounts; rowsRead: number } {
  const skips: SheetSkipCounts = { fbaShipment: 0, noOrderId: 0, noTracking: 0, duplicate: 0 };
  const byKey = new Map<string, { row: SheetRow; cols: SheetColumnIndices }>();
  let rowsRead = 0;
  for (const { rows, cols } of tabs) {
    for (const row of rows) {
      const at = (i: number) => (i >= 0 ? cleanText(row[i]) : '');
      if (!row.some((v) => cleanText(v) !== '')) continue; // padding
      rowsRead += 1;
      const orderNumber = at(cols.orderNumber);
      if (FBA_SHIPMENT_ID.test(orderNumber)) {
        skips.fbaShipment += 1;
        continue;
      }
      if (!orderNumber) {
        skips.noOrderId += 1;
        continue;
      }
      if (!at(cols.tracking)) {
        skips.noTracking += 1;
        continue;
      }
      // One line per (order, listing, title, tracking): a re-paste must not
      // become a second unit of the same order.
      const key = [orderNumber, at(cols.itemNumber), at(cols.itemTitle).toLowerCase(), at(cols.tracking).toUpperCase()].join('\u0000');
      if (byKey.has(key)) skips.duplicate += 1;
      byKey.set(key, { row, cols });
    }
  }
  return { rows: [...byKey.values()], skips, rowsRead };
}

export interface SheetBackfillDeps {
  /** Tab titles of the org's configured spreadsheet. Throws {@link SheetBackfillError} when unconfigured. */
  listTabs(orgId: OrgId): Promise<string[]>;
  /** Raw rows (header first) of each named tab, in the order asked. */
  readTabs(orgId: OrgId, titles: string[]): Promise<SheetRow[][]>;
  platformOf(orgId: OrgId): Promise<PlatformOf>;
  ingest(lines: CanonicalOrderLine[], orgId: OrgId, platformOf: PlatformOf, progress: SyncProgress): Promise<IngestCanonicalOrdersResult>;
  allocate(orgId: OrgId, insertedOrderIds: number[]): Promise<void>;
}

export async function runSheetBackfill(
  orgId: OrgId,
  deps: SheetBackfillDeps,
  opts: { full?: boolean; now?: number; onProgress?: SyncProgress } = {},
): Promise<SyncOutcome> {
  const progress: SyncProgress = opts.onProgress ?? (() => {});
  progress({ type: 'phase', phase: 'starting' });
  try {
    const titles = pickBackfillTabs(await deps.listTabs(orgId), opts);
    if (titles.length === 0) {
      progress({ type: 'phase', phase: 'done' });
      return {
        ok: true,
        imported: 0,
        updated: 0,
        stats: { tabs: 0 },
        details: { note: `No Sheet_MM_DD_YYYY tab in the last ${SHEET_BACKFILL_WINDOW_DAYS} days.` },
      };
    }
    const raw = await deps.readTabs(orgId, titles);
    const tabs: Array<{ rows: SheetRow[]; cols: SheetColumnIndices }> = [];
    const unreadable: string[] = [];
    raw.forEach((rows, i) => {
      if (rows.length === 0) return;
      const { colIndices, missing } = bindSheetColumns(rows[0]);
      if (missing.length > 0) {
        unreadable.push(`${titles[i]}: needs ${missing.map((m) => `"${m.expectedLabels[0]}"`).join(' and ')}`);
        return;
      }
      tabs.push({ rows: rows.slice(1), cols: colIndices });
    });
    const { rows, skips, rowsRead } = collectEligibleRows(tabs);
    progress({ type: 'phase', phase: 'fetching_sheet', count: rowsRead, message: `${titles.length} tab(s)` });
    if (tabs.length === 0 && unreadable.length > 0) throw new SheetBackfillError(`No readable tab — ${unreadable.join('; ')}`);

    const lines = rows.flatMap(({ row, cols }) => mapSheetRowsToCanonicalLines([row], cols));
    const platformOf = await deps.platformOf(orgId);
    const result = await deps.ingest(lines, orgId, platformOf, progress);
    await deps.allocate(orgId, result.insertedOrderIds);
    progress({ type: 'phase', phase: 'done' });

    return {
      ok: true,
      imported: result.insertedOrders,
      updated: result.updatedOrdersFields,
      stats: {
        tabs: titles.length,
        rowsRead,
        eligibleRows: rows.length,
        skippedFbaShipment: skips.fbaShipment,
        skippedNoOrderId: skips.noOrderId,
        skippedNoTracking: skips.noTracking,
        skippedDuplicate: skips.duplicate,
        trackingFilled: result.updatedOrdersTracking,
        unresolvedTracking: result.unresolvedTrackingCount,
        ambiguous: result.ambiguousOrderIds.length,
      },
      details: {
        ...result.details,
        tabs: titles,
        unreadableTabs: unreadable,
        ambiguousOrderIds: result.ambiguousOrderIds.slice(0, 50),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Sheets backfill failed';
    // A Google refusal (sheet not shared, quota) is an outcome the operator reads, not a 500.
    if (!(error instanceof SheetBackfillError)) console.error('[google-sheets-orders]', error);
    progress({ type: 'error', error: message });
    return { ok: false, error: message };
  }
}

/** Connector entrypoint (`registry.google_sheets.sync`) — Google + DB IO wired. */
export async function googleSheetsOrdersSync(orgId: OrgId, opts?: SyncOpts): Promise<SyncOutcome> {
  const [{ sheets: googleSheets }, { getGoogleAuth }, creds, catalog, { buildAccountSourceLookup }, ingest, alloc] =
    await Promise.all([
      import('@googleapis/sheets'),
      import('@/lib/google-auth'),
      import('@/lib/integrations/credentials'),
      import('@/lib/neon/catalog-queries'),
      import('@/lib/platform-display'),
      import('@/lib/orders/ingest-canonical-orders'),
      import('@/lib/allocation/auto-allocate'),
    ]);

  let client: { api: sheets_v4.Sheets; spreadsheetId: string } | null = null;
  const connect = async () => {
    if (client) return client;
    const c = await creds.getIntegrationCredentials<GoogleSheetsCredentials>(orgId, 'google_sheets');
    if (!c) throw new SheetBackfillError('Google Sheets is not connected for this organization.');
    const spreadsheetId = c.defaultSpreadsheetId?.trim();
    if (!spreadsheetId) throw new SheetBackfillError('Set the daily sheet spreadsheet ID on the Google Sheets connection.');
    client = { api: googleSheets({ version: 'v4', auth: getGoogleAuth(c) }), spreadsheetId };
    return client;
  };

  const deps: SheetBackfillDeps = {
    listTabs: async () => {
      const { api, spreadsheetId } = await connect();
      const book = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
      return (book.data.sheets ?? []).map((s) => s.properties?.title ?? '');
    },
    readTabs: async (_org, titles) => {
      const { api, spreadsheetId } = await connect();
      // One round trip for every tab in scope.
      const res = await api.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges: titles.map((t) => `'${t.replace(/'/g, "''")}'!A1:Z`),
      });
      return (res.data.valueRanges ?? []).map((r) => (r.values ?? []) as SheetRow[]);
    },
    platformOf: async (org) => {
      const [platforms, accounts] = await Promise.all([
        catalog.listPlatforms(org, { includeInactive: true }),
        catalog.listPlatformAccounts(org, { includeInactive: true }),
      ]);
      const lookup = buildAccountSourceLookup(platforms, accounts);
      return (source) => lookup(source).platform?.slug.trim().toLowerCase() ?? null;
    },
    ingest: (lines, org, platformOf, progress) =>
      ingest.ingestCanonicalOrders(lines, {
        orgId: org,
        source: SOURCE,
        progress,
        matchOn: 'accountSourceAndOrderId',
        // Fill blanks only: the sheet never rewrites a title or moves a status.
        authoritative: { productTitle: false, status: false },
        manageDeadlines: true,
        collapseDuplicates: false,
        // The sheet names every channel, like ShipStation: adopt the one
        // platform's row, never guess across two, insert only a true miss.
        aggregator: { platformOf },
      }),
    allocate: (org, ids) => alloc.autoAllocateAfterIngest(ids, { orgId: org, source: SOURCE }),
  };
  return runSheetBackfill(orgId, deps, { full: opts?.full, onProgress: opts?.onProgress });
}
