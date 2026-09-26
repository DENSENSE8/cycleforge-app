/** Sync idempotency primitive — ported from USAV_ERP's `generate_payload_hash` + the `zoho_last_sync_hash` skip pattern, generalized for… */
import { createHash } from 'node:crypto';

/** Recursively sort object keys so serialization is order-independent. Arrays
 *  keep their order (order is semantically meaningful for lists). */
function stableNormalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableNormalize);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v === undefined) continue; // undefined ≡ absent, so they hash the same
    out[key] = stableNormalize(v);
  }
  return out;
}

/** Deterministic JSON for hashing — sorted keys, undefined dropped. */
export function stableStringify(payload: unknown): string {
  return JSON.stringify(stableNormalize(payload));
}

/** SHA-256 hex of the stable serialization of `payload`. */
export function computeSyncHash(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload), 'utf8').digest('hex');
}

/** True when `payload` is unchanged vs the last-synced hash (i.e. */
export function evaluateSync(
  payload: unknown,
  previousHash: string | null | undefined,
): { hash: string; unchanged: boolean } {
  const hash = computeSyncHash(payload);
  return { hash, unchanged: previousHash != null && previousHash === hash };
}
