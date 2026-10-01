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
  quantity: number;
  skuCount: number;
  empty: boolean;
  hasException: boolean;
  hasOnHold: boolean;
  lastTouched: string | null;
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
    const stockRows = sourceRows.filter((row) => row.source !== 'empty');
    const skus = new Set(stockRows.map((row) => row.sku.trim()).filter(Boolean));
    const routeCode = anchor.location_barcode?.trim() || null;
    return {
      key,
      locationId: anchor.location_id,
      routeCode,
      face: anchor.location_name?.trim() || routeCode || 'Unlocated',
      room: anchor.room?.trim() || null,
      quantity: stockRows.reduce((sum, row) => sum + Math.max(0, row.qty), 0),
      skuCount: skus.size,
      empty: stockRows.length === 0,
      hasException: sourceRows.some((row) => row.source === 'exception') || anchor.location_id == null,
      hasOnHold: sourceRows.some((row) => row.is_provisional),
      lastTouched: newestInstant(sourceRows),
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
