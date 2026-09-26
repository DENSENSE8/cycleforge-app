/** `/review` mode vocabulary — the ONE parse of `?mode=` for the Review station. */

export type ReviewMode = 'packer' | 'pairing' | 'catalog-link';

/** Live Review modes — includes default `packer` (usually omitted from the URL). */
const REVIEW_MODES = [
  'packer',
  'pairing',
  'catalog-link',
] as const satisfies readonly ReviewMode[];

/** Packing is the default and carries NO `?mode=` (its mode target nulls it). */
export function parseReviewMode(raw: string | null | undefined): ReviewMode {
  if (raw === 'pairing') return 'pairing';
  if (raw === 'catalog-link') return 'catalog-link';
  return 'packer';
}

/**
 * Wire tokens `?mode=` may carry on `/review` (route-param hygiene).
 * Includes `packer` so a deep link is not stripped. Do not round-trip
 * {@link parseReviewMode} — it always coerces unknowns to `packer`.
 */
export function parseReviewModeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (REVIEW_MODES as readonly string[]).includes(v) ? v : null;
}
