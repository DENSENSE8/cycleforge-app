/**
 * Outbound storage-path facts — React-free presentation of allocated unit
 * locations. The orders API supplies every live allocation location; this
 * formatter never chooses an arbitrary first unit when an order spans bins.
 */

export interface OutboundStorageLocation {
  barcode?: string | null;
  name?: string | null;
  room?: string | null;
  zoneLetter?: string | null;
  rowLabel?: string | null;
  colLabel?: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

/**
 * `ZONE-C // AISLE-02-01-2 // C0201200`: the aisle carries its shelf level (the first segment of
 * `colLabel`, `2-00` → `2`) so the picker knows which shelf (owner 2026-10-08: `AISLE-02-01` alone
 * left the level out), and after the last `//` sits the bin's — or tote's — own code, no word before it.
 */
function locationPath(location: OutboundStorageLocation): string | null {
  const zone = clean(location.zoneLetter);
  const row = clean(location.rowLabel);
  const level = clean(location.colLabel)?.split('-')[0] ?? null;
  const aisle = row ? (level ? `${row}-${level}` : row) : null;
  const code = clean(location.barcode) ?? clean(location.name) ?? clean(location.colLabel);
  const parts = [zone ? `ZONE-${zone}` : clean(location.room), aisle ? `AISLE-${aisle}` : null, code].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(' // ') : null;
}

/**
 * A compact, honest card label. One allocated bin becomes a warehouse
 * breadcrumb; several are retained in stable order rather than hidden behind
 * a false single-bin answer.
 */
export function formatOutboundStoragePath(
  locations: readonly OutboundStorageLocation[] | null | undefined,
): string | null {
  const paths = Array.from(new Set((locations ?? []).map(locationPath).filter(Boolean)));
  return paths.length > 0 ? paths.join(' | ') : null;
}

/** Where an order's BIN comes from: its allocated units, else its SKU's home bin. */
export interface OrderBinFace {
  path: string | null;
  source: 'allocation' | 'sku_home' | null;
}

/** The record's BIN: */
export function resolveOrderBin(
  storageLocations: readonly OutboundStorageLocation[] | null | undefined,
  skuHome: OutboundStorageLocation | null | undefined,
): OrderBinFace {
  const allocated = formatOutboundStoragePath(storageLocations);
  if (allocated) return { path: allocated, source: 'allocation' };
  const home = skuHome ? formatOutboundStoragePath([skuHome]) : null;
  return home ? { path: home, source: 'sku_home' } : { path: null, source: null };
}
