/** Zoho PO `last_modified_time` / mirror `last_modified_zoho` comparison for Inventory Displays block-if-stale Cmd+S. */

/** Normalize Zoho / Postgres timestamptz strings for equality. */
export function normalizeZohoLastModified(
  value: string | null | undefined,
): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    // Fall back to trimmed raw so identical strings still match when parse fails.
    return raw;
  }
  return new Date(ms).toISOString();
}

/** True when a Save must refuse overwrite. */
export function isZohoPoStampStale(
  baseLastModified: string | null | undefined,
  liveLastModified: string | null | undefined,
): boolean {
  const base = normalizeZohoLastModified(baseLastModified);
  if (!base) return false;
  const live = normalizeZohoLastModified(liveLastModified);
  if (!live) return true;
  return base !== live;
}

export function readZohoPoLastModified(
  po: { last_modified_time?: string | null } | null | undefined,
): string | null {
  if (!po) return null;
  return normalizeZohoLastModified(po.last_modified_time ?? null);
}
