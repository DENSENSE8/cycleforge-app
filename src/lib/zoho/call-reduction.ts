/**
 * Pure helpers that cut Zoho Inventory call volume without changing product
 * semantics. Kept DB/HTTP-free so unit tests stay dependency-free.
 */

/** True when local lines already mirror this Zoho last-modified stamp. */
export function shouldSkipPoDetailFetch(args: {
  listLastModified: string | null | undefined;
  localLineCount: number;
  localMaxLastModified: string | null | undefined;
}): boolean {
  const listLm = String(args.listLastModified ?? '').trim();
  if (!listLm) return false;
  if (!Number.isFinite(args.localLineCount) || args.localLineCount <= 0) return false;
  const localLm = String(args.localMaxLastModified ?? '').trim();
  if (!localLm) return false;
  return localLm === listLm;
}

/** Canonical alnum form used for tracking / Reference# matching. */
export function canonicalizeTrackingKey(value: string | null | undefined): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Prefer exact Reference# match; only accept a last-8 suffix hit when it is
 * unique (same collision guard as live Zoho last-8 search).
 */
export function pickMirrorPoIdFromCandidates(args: {
  exactPoIds: string[];
  suffixPoIds: string[];
}): string | null {
  const exact = [...new Set(args.exactPoIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) {
    // Ambiguous exact keys — do not guess.
    return null;
  }
  const suffix = [...new Set(args.suffixPoIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (suffix.length === 1) return suffix[0]!;
  return null;
}
