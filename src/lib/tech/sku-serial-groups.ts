/**
 * SKU ↔ serial pairing groups for the shipping station workspace.
 * Keeps scan-session state aligned across SKU pulls, direct serial captures,
 * and undo without a second server round-trip.
 */

export interface SkuSerialGroup {
  sku: string;
  serials: string[];
}

function normalizeSkuKey(sku: string | null | undefined): string {
  const key = String(sku || '').trim();
  if (!key || /^n\/a$/i.test(key)) return '—';
  return key;
}

/** Seed groups when an order/FNSKU loads — existing serials land under the order SKU. */
export function initSkuSerialGroups(
  sku: string | null | undefined,
  serials: string[] = [],
): SkuSerialGroup[] {
  const key = normalizeSkuKey(sku);
  if (serials.length === 0 && key === '—') return [];
  return [{ sku: key, serials: [...serials] }];
}

/** Merge newly resolved serials into the group for `sku` (SKU:tag pull). */
export function mergeSkuSerialGroups(
  groups: SkuSerialGroup[] | undefined,
  sku: string,
  addedSerials: string[],
): SkuSerialGroup[] {
  const key = normalizeSkuKey(sku);
  const next = [...(groups ?? [])];
  if (addedSerials.length === 0 && !next.some((g) => g.sku === key)) {
    next.push({ sku: key, serials: [] });
    return next;
  }

  const idx = next.findIndex((g) => g.sku === key);
  if (idx < 0) {
    next.push({ sku: key, serials: [...addedSerials] });
    return next;
  }

  const existing = new Set(next[idx].serials.map((s) => s.toUpperCase()));
  const merged = [...next[idx].serials];
  for (const serial of addedSerials) {
    const upper = serial.toUpperCase();
    if (!existing.has(upper)) {
      merged.push(serial);
      existing.add(upper);
    }
  }
  next[idx] = { ...next[idx], serials: merged };
  return next;
}

/** Append one serial under the order/storage SKU (direct serial scan). */
export function appendSerialToSkuGroups(
  groups: SkuSerialGroup[] | undefined,
  sku: string | null | undefined,
  serial: string,
): SkuSerialGroup[] {
  return mergeSkuSerialGroups(groups, normalizeSkuKey(sku), [serial]);
}

/**
 * After undo / remove — keep pairings that still have serials, re-home orphans
 * under the order SKU, and preserve an empty order-SKU row when the session
 * still has an active SKU but zero serials.
 */
export function rebuildSkuSerialGroups(
  previous: SkuSerialGroup[] | undefined,
  remainingSerials: string[],
  orderSku?: string | null,
): SkuSerialGroup[] {
  const remainingUpper = new Set(
    remainingSerials.map((s) => String(s).trim().toUpperCase()).filter(Boolean),
  );

  const rebuilt = (previous ?? [])
    .map((g) => ({
      sku: g.sku,
      serials: g.serials.filter((s) => remainingUpper.has(String(s).trim().toUpperCase())),
    }))
    .filter((g) => g.serials.length > 0);

  const claimed = new Set(
    rebuilt.flatMap((g) => g.serials.map((s) => String(s).trim().toUpperCase())),
  );
  const orphans = remainingSerials.filter(
    (s) => !claimed.has(String(s).trim().toUpperCase()),
  );
  if (orphans.length > 0) {
    const key = normalizeSkuKey(orderSku);
    const idx = rebuilt.findIndex((g) => g.sku === key);
    if (idx >= 0) {
      rebuilt[idx] = { ...rebuilt[idx], serials: [...rebuilt[idx].serials, ...orphans] };
    } else {
      rebuilt.push({ sku: key, serials: orphans });
    }
  }

  if (rebuilt.length === 0) {
    return initSkuSerialGroups(orderSku, remainingSerials);
  }
  return rebuilt;
}
