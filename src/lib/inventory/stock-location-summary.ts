import { parseLocationCodeFlat } from '@/lib/barcode-routing';
import {
  locationStockWalkRows,
  type LocationStockTableRow,
} from './location-stock-row';

/** One dense row in the mobile warehouse walk. SKU facts remain behind the tap. */
export interface StockLocationSummary {
  key: string;
  locationId: number | null;
  /** The scannable address used by `/m/loc/[code]`; null means this placement needs repair. */
  routeCode: string | null;
  face: string;
  room: string | null;
  /** Parsed from a room-coded address (`C-03-10-3-05`); null for racks, totes and free-written places. */
  aisle: number | null;
  bay: number | null;
  level: number | null;
  position: number | null;
  quantity: number;
  skuCount: number;
  empty: boolean;
  hasException: boolean;
  hasOnHold: boolean;
  /** Zero-count provisional placement that needs cleanup, not active stock. */
  hasCleanup: boolean;
  lastTouched: string | null;
  /**
   * The place's photo: of the items here, the photo of the one photographed
   * last (newest `SKU_STOCK` link); else the first item's catalog / Zoho image.
   * Null when nothing here has a picture.
   */
  photoUrl: string | null;
  rows: LocationStockTableRow[];
}

function locationKey(row: LocationStockTableRow): string {
  if (row.location_id != null) return `id:${row.location_id}`;
  const written = row.location_barcode?.trim() || row.location_name?.trim();
  return written ? `written:${written.toUpperCase()}` : 'unlocated';
}

function newestInstant(rows: readonly LocationStockTableRow[]): string | null {
  let newest: string | null = null;
  for (const row of rows) {
    for (const value of [row.last_moved, row.last_counted]) {
      if (value && (!newest || value > newest)) newest = value;
    }
  }
  return newest;
}

function newestPhoto(rows: readonly LocationStockTableRow[]): string | null {
  let newest: LocationStockTableRow | null = null;
  for (const row of rows) {
    if (!row.latest_photo_url || !row.latest_photo_at) continue;
    if (!newest || row.latest_photo_at > newest.latest_photo_at!) newest = row;
  }
  return newest?.latest_photo_url ?? rows.find((row) => row.image_url)?.image_url ?? null;
}

/** Fold the desktop stock read into a physical-location walk without losing source rows. */
export function summarizeStockLocations(
  rows: readonly LocationStockTableRow[],
): StockLocationSummary[] {
  const grouped = new Map<string, LocationStockTableRow[]>();
  for (const row of rows) {
    const key = locationKey(row);
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }

  return locationStockWalkRows(rows, 'location-asc').map((anchor) => {
    const key = locationKey(anchor);
    const sourceRows = grouped.get(key) ?? [anchor];
    const inventoryRows = sourceRows.filter((row) => row.source !== 'empty');
    const stockRows = inventoryRows.filter((row) => row.qty > 0);
    const skus = new Set(stockRows.map((row) => row.sku.trim()).filter(Boolean));
    const routeCode = anchor.location_barcode?.trim() || null;
    // The scannable code is the place's identity: its coordinates win over the
    // legacy row/col labels, which only stand in for a place without a code.
    const coded = routeCode ? parseLocationCodeFlat(routeCode) : null;
    const aisle = coded ? Number(coded.aisle) : anchor.aisle;
    const bay = coded ? Number(coded.bay) : anchor.bay;
    const level = coded ? Number(coded.level) : anchor.level;
    const position = coded ? Number(coded.position) : anchor.position;
    return {
      key,
      locationId: anchor.location_id,
      routeCode,
      face: anchor.location_name?.trim() || routeCode || 'Unlocated',
      room: anchor.room?.trim() || null,
      // A bay needs an aisle, a level a bay: a half-parsed address is not a place in the walk.
      aisle,
      bay: aisle != null ? bay : null,
      level: aisle != null && bay != null ? level : null,
      position: aisle != null && bay != null ? position : null,
      quantity: stockRows.reduce((sum, row) => sum + Math.max(0, row.qty), 0),
      skuCount: skus.size,
      empty: stockRows.length === 0,
      hasException: sourceRows.some((row) => row.source === 'exception') || anchor.location_id == null,
      hasOnHold: stockRows.some((row) => row.is_provisional),
      hasCleanup: inventoryRows.some((row) => row.is_provisional && row.qty <= 0),
      lastTouched: newestInstant(sourceRows),
      photoUrl: newestPhoto(stockRows),
      rows: sourceRows,
    };
  });
}

/** Contextual find stays instant after the server has loaded the active room. */
export function stockLocationMatches(summary: StockLocationSummary, rawQuery: string): boolean {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return true;
  const flat = query.replace(/[^a-z0-9]/g, '');
  return [
    summary.face,
    summary.routeCode,
    summary.room,
    ...summary.rows.flatMap((row) => [row.sku, row.product_title]),
  ].some((value) => {
    const candidate = value?.toLocaleLowerCase() ?? '';
    return candidate.includes(query) || (flat.length > 0 && candidate.replace(/[^a-z0-9]/g, '').includes(flat));
  });
}
