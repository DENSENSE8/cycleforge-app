/**
 * The History row handle — `visit:19` / `repair:4799`.
 *
 * Callers: `listKioskVisits` (mints), `kiosk-history-client` + `KioskHistoryPane`
 * (parse and route on). Affected API: none. Schemas: none.
 *
 * ## Why this is its own module
 *
 * History unions two books whose id spaces are independent, so a row is only
 * addressable as (book, id). The rail, the detail fetch and the reader must
 * agree on that spelling, and the tablet is a CLIENT: importing the helper from
 * `list-kiosk-visits` would drag `tenantQuery` — and the Neon driver behind
 * `server-only` — into the kiosk bundle, which is a build error, not a
 * bundle-size opinion. Pure string work, no imports, safe on both sides.
 */

/** Which book a history row came from. Part of its identity, not a hint. */
export type KioskHistorySource = 'visit' | 'repair';

export function kioskHistoryKey(source: KioskHistorySource, id: number): string {
  return `${source}:${id}`;
}

/** Null for anything that is not a key `listKioskVisits` minted. */
export function parseKioskHistoryKey(
  raw: string | null | undefined,
): { source: KioskHistorySource; id: number } | null {
  if (!raw) return null;
  const at = raw.indexOf(':');
  if (at <= 0) return null;
  const source = raw.slice(0, at);
  if (source !== 'visit' && source !== 'repair') return null;
  const id = Number(raw.slice(at + 1));
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { source, id };
}
