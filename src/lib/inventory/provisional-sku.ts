/** Provisional SKUs — the on-hold placeholder product, and the arithmetic of merging one into a real SKU. */

/** Prefix every provisional SKU carries. Visible, on purpose. */
const PROVISIONAL_SKU_PREFIX = 'TMP-';

/** Ledger reason recorded when a merge re-keys history onto the real SKU. */
export const PROVISIONAL_MERGE_REASON = 'PROVISIONAL_MERGE';

/** Normalise a scanned barcode into the form the provisional key is built from. */
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

/** The provisional SKU for a product that has NO barcode — a name typed on the phone, a row on a bin sheet — keyed by the caller's… */
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

interface MergePlan {
  /** Locations where the target already has a row — quantities add. */
  folds: Array<{ locationId: number; provisionalQty: number; targetQty: number; mergedQty: number }>;
  /** Locations where only the provisional has a row — the row is re-keyed. */
  rekeys: Array<{ locationId: number; qty: number }>;
  /** Total units the merge moves onto the target SKU. */
  qtyMoved: number;
  /** How many bin_contents rows the merge touches. */
  binRowsMoved: number;
}

/** Decide, per location, whether merging is an ADD or a RE-KEY. */
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

type MergeRefusal =
  | { ok: true }
  | { ok: false; reason: 'not-provisional' | 'target-is-provisional' | 'same-sku' | 'missing-sku' };

/** Whether a merge may proceed at all. */
export function checkMergeAllowed(provisionalSku: string, targetSku: string): MergeRefusal {
  const from = provisionalSku.trim();
  const to = targetSku.trim();
  if (!from || !to) return { ok: false, reason: 'missing-sku' };
  if (from === to) return { ok: false, reason: 'same-sku' };
  if (!isProvisionalSku(from)) return { ok: false, reason: 'not-provisional' };
  if (isProvisionalSku(to)) return { ok: false, reason: 'target-is-provisional' };
  return { ok: true };
}
