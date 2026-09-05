/**
 * Server paint seed for the mobile receiving feeds (`/m/home`, `/m/receive`,
 * `/m/triage`) and the `/m/scan` prioritize panel.
 *
 * ## Why this is PROJECTED, and why that is the whole point
 *
 * The feed is the phone's whole screen and its largest contentful element. Put
 * it in the first HTML and LCP resolves at FCP; leave it out and LCP waits for
 * hydrate + fetch, which Lantern charges 4-5x under the mobile profile.
 *
 * The first version of this seed shipped whole `receiving_lines` records — 101
 * fields, every `zoho_*`, staging-location and shipment-tracking column — at
 * ~12KB of document per row, duplicated across the SSR HTML and the RSC flight
 * payload. Measured on the Vercel preview 2026-09-02:
 *
 *   seeded, 101 fields   `/m/home` 461KB document, observed FCP 2522ms, Perf 54
 *   seed removed         `/m/home` 143KB document, observed FCP 2619ms, Perf 57
 *
 * Both fail, for OPPOSITE reasons: the fat seed is too many bytes to paint, and
 * no seed leaves nothing contentful to paint (SSR text fell 2255 chars → 33).
 * A skeleton does not close the gap either — FCP/LCP count text, images and
 * background-IMAGE elements, never plain background-colour divs, so a stand-in
 * built from `Skeleton` blocks is invisible to both metrics by construction.
 *
 * So: seed the REAL rows, projected to the ~19 fields the first screen renders.
 * Same paint, ~1/5th the bytes per row.
 *
 * TTFB is not the constraint and never was — 35ms server response, documents
 * landing at 466ms on the preview, app and database co-located. Bytes are.
 *
 * Scope discipline: this is a PAINT seed, not a data source. Every failure path
 * returns `null` and the client fetches exactly as before, so a seed problem
 * degrades to the old behaviour rather than an error page. The client's
 * `refetchOnMount: 'always'` replaces these projected rows with complete ones
 * immediately on mount.
 */
import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { mobileFeedQueryKey, type MobileFeedSurface } from '@/lib/receiving/mobile-feed-query-key';
import { getCurrentUser } from '@/lib/auth/current-user';
import { rankUnboxMruReceivingIds, readUnboxOpenedRows } from '@/lib/queries/unbox-spine-seed.server';
import { withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { parseReceivingLinesQuery } from '@/lib/receiving/lines/query';
import {
  buildReceivingLinesListSql,
  buildScannedCandidateSql,
} from '@/lib/receiving/lines/build-sql';
import { normalizeRow } from '@/lib/receiving/lines/normalize-row';
import { isReceivingPhysicalStateFirst, isUnboxRailColumnRead } from '@/lib/feature-flags';
import {
  SCAN_PRIORITIZE_QUERY_KEY,
  mapPrioritizeRows,
} from '@/components/mobile/redesign/scan-feed-items';

/**
 * One phone screen. `useCaptureStackWindow` windows the feed to `limit` (8 on
 * `/m/home`, 25 at most), so a bigger seed buys no visible content and costs the
 * document twice — rendered to HTML *and* carried again in the flight payload.
 */
const SEED_ROWS = 12;

/**
 * Every field the first screen reads, and nothing else — the union of
 * `receiving-feed-entries` (carton grouping), `MobileReceivingUnitRow` (the
 * painted row) and `receivingLinePhotoHrefs` (the capture CTA).
 *
 * ADDING A FIELD TO THE PAINTED ROW MEANS ADDING IT HERE, or it renders
 * undefined for the ~300ms before the client's refetch lands. Tap-through
 * sheets are deliberately NOT covered: they open long after the full rows have
 * arrived, and `liveSheetRow` re-derives them from the live feed anyway.
 */
const FIRST_PAINT_FIELDS = [
  'id',
  'receiving_id',
  'item_name',
  'catalog_product_title',
  'zoho_item_title',
  'zoho_item_id',
  'sku',
  'tracking_number',
  'carrier',
  'notes',
  'zoho_purchaseorder_id',
  'zoho_purchaseorder_number',
  'condition_grade',
  'photo_count',
  'quantity_expected',
  'quantity_received',
  'unit_price',
  'workflow_status',
  'zendesk_ticket',
] as const satisfies readonly (keyof ReceivingLineRow)[];

/**
 * Project + wire-shape in one pass.
 *
 * The JSON round-trip IS the wire shape the client's `res.json()` produces
 * (Dates → strings, `undefined` dropped), so this is the one place the row type
 * is asserted — exactly as the fetch path asserts it. Narrowing to
 * `FIRST_PAINT_FIELDS` happens before serialisation, so the omitted 80-odd
 * columns never reach the document at all.
 */
function toPaintRows(rows: readonly Record<string, unknown>[]): ReceivingLineRow[] {
  const projected = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const field of FIRST_PAINT_FIELDS) {
      if (row[field] !== undefined) out[field] = row[field];
    }
    return out;
  });
  return JSON.parse(JSON.stringify(projected)) as ReceivingLineRow[];
}

export async function seedMobileReceivingFeed(
  surface: MobileFeedSurface,
): Promise<DehydratedState | null> {
  try {
    const user = await getCurrentUser();
    const orgId = user?.organizationId as OrgId | undefined;
    if (!orgId) return null;

    const rows =
      surface === 'triage'
        ? await readScannedPrioritizedRows(orgId, SEED_ROWS)
        : await readUnboxOpenedRowsRanked(orgId, SEED_ROWS);
    const paintRows = toPaintRows(rows as readonly Record<string, unknown>[]);
    if (paintRows.length === 0) return null;

    const client = new QueryClient();
    client.setQueryData([...mobileFeedQueryKey(surface)], paintRows);
    return dehydrate(client);
  } catch (error) {
    console.error('seedMobileReceivingFeed failed; client will fetch', error);
    return null;
  }
}

/** Unbox surface: rank on the indexed `opened_at` column, then hydrate those
 *  cartons — the station seed's own pair, reused. */
async function readUnboxOpenedRowsRanked(orgId: OrgId, limit: number) {
  const ids = await rankUnboxMruReceivingIds(orgId, limit);
  if (ids.length === 0) return [];
  return readUnboxOpenedRows(orgId, ids);
}

/**
 * Triage/scan surfaces: gate-before-decorate over `view=scanned&sort=priority`
 * — the candidate ranking (15ms warm since `idx_receiving_org_source_order`),
 * then the narrowed list, one tenant connection.
 */
async function readScannedPrioritizedRows(
  orgId: OrgId,
  limit: number,
): Promise<ReturnType<typeof normalizeRow>[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: '0',
    view: 'scanned',
    sort: 'priority',
  });
  const query = parseReceivingLinesQuery(params);
  const applyScannedZohoExclusion = !isReceivingPhysicalStateFirst();
  const unboxRailColumnRead = isUnboxRailColumnRead();
  const candidate = buildScannedCandidateSql({
    orgId,
    limit,
    applyScannedZohoExclusion,
    unboxRailColumnRead,
  });
  return withTenantConnection(orgId, async (client) => {
    const cand = await client.query(candidate.sql, candidate.params as unknown[]);
    const ids = cand.rows
      .map((r) => Number((r as { id: number }).id))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return [];
    const built = buildReceivingLinesListSql({
      query,
      orgId,
      viewerStaffId: NaN,
      universalIncoming: false,
      applyScannedZohoExclusion,
      unboxRailColumnRead,
      scannedLineIdIn: ids,
    });
    const res = await client.query(built.list.sql, built.list.params);
    return res.rows.map((r) => normalizeRow(r as Record<string, unknown>));
  });
}

/**
 * Paint seed for `/m/scan`'s default screen — the Receiving · Prioritize feed.
 *
 * Already narrow by construction: `mapPrioritizeRows` collapses each row to a
 * `ScanFeedItem`, so no field projection is needed here. What it did need was a
 * ROW cap — this asked for 500 rows to "mirror the panel's request window",
 * which put ~25KB of feed into a document whose whole job is a fast first
 * paint. The panel windows to one screen regardless.
 */
export async function seedMobileScanPrioritize(): Promise<DehydratedState | null> {
  try {
    const user = await getCurrentUser();
    const orgId = user?.organizationId as OrgId | undefined;
    if (!orgId) return null;

    const rows = await readScannedPrioritizedRows(orgId, SEED_ROWS);
    const wireRows = JSON.parse(JSON.stringify(rows)) as ReceivingLineRow[];
    if (wireRows.length === 0) return null;

    const client = new QueryClient();
    client.setQueryData([...SCAN_PRIORITIZE_QUERY_KEY], mapPrioritizeRows(wireRows));
    return dehydrate(client);
  } catch (error) {
    console.error('seedMobileScanPrioritize failed; client will fetch', error);
    return null;
  }
}
