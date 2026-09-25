/**
 * Provisional SKUs — the on-hold placeholder product, and the arithmetic of
 * merging one into a real SKU.
 *
 * Pure: no I/O, no clock, no React. The database work that uses these lives in
 * `src/lib/neon/provisional-sku-queries.ts`; this module owns the decisions so
 * they can be tested without a Postgres.
 *
 * ## The SKU string is derived, not allocated
 *
 * A provisional's key is `TMP-<normalised barcode>`. Deriving it from the
 * barcode rather than handing out a sequence number buys the property the
 * whole feature depends on: scanning the SAME physical box twice resolves to
 * the SAME provisional, so two operators working opposite ends of a rack
 * cannot end up with half the count each under rival placeholder ids. A
 * product with no barcode derives its key from the caller's idempotency key
 * instead (`provisionalSkuForSourceRef`), for the same reason.
 *
 * The `TMP-` prefix is load-bearing in a second way — any report that renders
 * a raw SKU string shows it as obviously not a real product, which is the
 * cheapest possible guard against someone treating it as sellable.
 */

/** Prefix every provisional SKU carries. Visible, on purpose. */
export const PROVISIONAL_SKU_PREFIX = 'TMP-';

/** Ledger reason recorded when a merge re-keys history onto the real SKU. */
export const PROVISIONAL_MERGE_REASON = 'PROVISIONAL_MERGE';

/**
 * Normalise a scanned barcode into the form the provisional key is built from.
 *
 * Upper-cased and stripped of everything but alphanumerics: a UPC read off a
 * label may arrive with spaces or hyphens depending on the symbology and the
 * gun's suffix settings, and `0 12345 67890 5` must not mint a second
 * placeholder beside `012345678905`.
 */
export function normalizeProvisionalBarcode(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * The provisional SKU for a barcode, or null when the barcode is unusable.
 *
 * Null rather than a throw because the caller is a floor surface: an empty or
 * junk read is an ordinary event there, not an exception.
 */
export function provisionalSkuForBarcode(rawBarcode: string): string | null {
  const normalized = normalizeProvisionalBarcode(rawBarcode);
  if (!normalized) return null;
  return `${PROVISIONAL_SKU_PREFIX}${normalized}`;
}

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const FNV64_OFFSET = BigInt('0xcbf29ce484222325');
const FNV64_PRIME = BigInt('0x100000001b3');
const FMIX64_C1 = BigInt('0xff51afd7ed558ccd');
const FMIX64_C2 = BigInt('0xc4ceb9fe1a85ec53');
const SHIFT_33 = BigInt(33);
const U64_MASK = (BigInt(1) << BigInt(64)) - BigInt(1);

/**
 * The provisional SKU for a product that has NO barcode — a name typed on the
 * phone, a row on a bin sheet — keyed by the caller's idempotency key.
 *
 * Same (org, key) → same SKU, so a double-tapped Create or a re-run import
 * joins the placeholder it already made instead of minting a rival (the same
 * property `provisionalSkuForBarcode` gets from the physical barcode). The key
 * is NOT the title: two different boxes can share a name.
 *
 * The org is hashed in because `sku_catalog.sku` and `sku_stock.sku` are
 * GLOBALLY unique: the same import run against the QA sandbox and then the
 * real org must not mint the same string twice.
 *
 * Shape `TMP-XXXXX-XXXXX` (50 bits of FNV-1a 64 + murmur3 fmix64, Crockford
 * base32). The finaliser matters: bare FNV barely moves the high bits for
 * keys that differ in one trailing character (`…:C-04-15-1` / `…-2`), which
 * made sibling SKUs near-identical. The inner hyphen is deliberate: barcode
 * normalisation strips hyphens, so a barcode-derived key can never collide
 * with one of these.
 *
 * Pure and dependency-free (no `node:crypto`) because client code imports
 * this module.
 */
export function provisionalSkuForSourceRef(orgId: string, rawRef: string): string | null {
  const ref = String(rawRef ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const org = String(orgId ?? '').trim().toLowerCase();
  if (!ref || !org) return null;
  let hash = FNV64_OFFSET;
  for (const byte of new TextEncoder().encode(`${org}\n${ref}`)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV64_PRIME) & U64_MASK;
  }
  hash ^= hash >> SHIFT_33;
  hash = (hash * FMIX64_C1) & U64_MASK;
  hash ^= hash >> SHIFT_33;
  hash = (hash * FMIX64_C2) & U64_MASK;
  hash ^= hash >> SHIFT_33;
  let chars = '';
  for (let i = 0; i < 10; i += 1) {
    chars += CROCKFORD_BASE32[Number(hash & BigInt(31))];
    hash >>= BigInt(5);
  }
  return `${PROVISIONAL_SKU_PREFIX}${chars.slice(0, 5)}-${chars.slice(5)}`;
}

/** True when a SKU string is a floor-minted placeholder. */
export function isProvisionalSku(sku: string | null | undefined): boolean {
  return typeof sku === 'string' && sku.trim().toUpperCase().startsWith(PROVISIONAL_SKU_PREFIX);
}

export interface ProvisionalBinRow {
  locationId: number;
  qty: number;
}

export interface MergePlan {
  /** Locations where the target already has a row — quantities add. */
  folds: Array<{ locationId: number; provisionalQty: number; targetQty: number; mergedQty: number }>;
  /** Locations where only the provisional has a row — the row is re-keyed. */
  rekeys: Array<{ locationId: number; qty: number }>;
  /** Total units the merge moves onto the target SKU. */
  qtyMoved: number;
  /** How many bin_contents rows the merge touches. */
  binRowsMoved: number;
}

/**
 * Decide, per location, whether merging is an ADD or a RE-KEY.
 *
 * Both cases exist in the same merge and they are different writes: where the
 * real SKU is already stocked in the same bin the two quantities must sum onto
 * one row (`bin_contents` is UNIQUE(location_id, sku), so two rows cannot
 * coexist); where it is not, the provisional's row simply changes its `sku`
 * and keeps its `min_qty` / `max_qty` / `last_counted`.
 *
 * Getting this wrong in the obvious direction — re-keying everything — makes
 * the merge fail on the unique index for exactly the bins that matter most,
 * the ones already holding the real product.
 *
 * Zero-quantity provisional rows are dropped rather than moved: they carry no
 * count and folding them would create empty rows under the target SKU.
 */
export function planProvisionalMerge(
  provisionalRows: readonly ProvisionalBinRow[],
  targetRows: readonly ProvisionalBinRow[],
): MergePlan {
  const targetByLocation = new Map(targetRows.map((row) => [row.locationId, row.qty]));
  const plan: MergePlan = { folds: [], rekeys: [], qtyMoved: 0, binRowsMoved: 0 };

  for (const row of provisionalRows) {
    if (row.qty <= 0) continue;
    plan.qtyMoved += row.qty;
    plan.binRowsMoved += 1;
    const targetQty = targetByLocation.get(row.locationId);
    if (targetQty == null) {
      plan.rekeys.push({ locationId: row.locationId, qty: row.qty });
    } else {
      plan.folds.push({
        locationId: row.locationId,
        provisionalQty: row.qty,
        targetQty,
        mergedQty: targetQty + row.qty,
      });
    }
  }

  return plan;
}

export type MergeRefusal =
  | { ok: true }
  | { ok: false; reason: 'not-provisional' | 'target-is-provisional' | 'same-sku' | 'missing-sku' };

/**
 * Whether a merge may proceed at all.
 *
 * Merging INTO another provisional is refused rather than chained: the
 * feature's promise is that a placeholder ends at a real catalog SKU, and
 * allowing TMP→TMP builds chains whose reconciliation nobody has specified.
 */
export function checkMergeAllowed(provisionalSku: string, targetSku: string): MergeRefusal {
  const from = provisionalSku.trim();
  const to = targetSku.trim();
  if (!from || !to) return { ok: false, reason: 'missing-sku' };
  if (from === to) return { ok: false, reason: 'same-sku' };
  if (!isProvisionalSku(from)) return { ok: false, reason: 'not-provisional' };
  if (isProvisionalSku(to)) return { ok: false, reason: 'target-is-provisional' };
  return { ok: true };
}
