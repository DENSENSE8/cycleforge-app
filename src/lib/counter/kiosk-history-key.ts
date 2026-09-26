/** The History row handle — `visit:19` / `repair:4799`. */

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
