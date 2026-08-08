/**
 * Zoho PO `last_modified_time` / mirror `last_modified_zoho` comparison for
 * Inventory Displays block-if-stale Cmd+S.
 *
 * Never blind last-write-wins: when the operator has a base stamp from the last
 * trusted pull, a Save that sees a different live Zoho stamp must refuse the
 * push and keep the draft dirty until they Refresh.
 */

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

/**
 * True when a Save must refuse overwrite.
 * - Missing base → allow (no trusted pull yet; cannot detect drift).
 * - Missing live after a fetch failure is handled by the caller — pass null live
 *   only when the live stamp is genuinely absent on the PO.
 * - Both present and unequal → stale.
 */
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
