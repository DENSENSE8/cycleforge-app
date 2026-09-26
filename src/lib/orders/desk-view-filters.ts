/** Outbound desk VIEW filters — the two lenses the desk sidebar adds on top of the existing queues: */

import { DESK_PAIR_PARAM, DESK_QUEUE_PARAM, type DeskCountKey } from '@/lib/outbound/desk-views';

export type DeskPairFilter = 'po';
export type DeskQueueFilter = 'pick';

/** `GET /api/orders/desk-counts` payload. */
export type DeskCounts = Readonly<Record<DeskCountKey, number>>;

const DESK_COUNT_KEYS: readonly DeskCountKey[] = ['exceptions', 'po', 'pick', 'triage', 'shippedToday'];

/** `?pair=` → the pairing lens, or `null` for anything but the one known value. */
export function parseDeskPairParam(raw: string | null | undefined): DeskPairFilter | null {
  return String(raw ?? '').trim().toLowerCase() === 'po' ? 'po' : null;
}

/** `?queue=` → the queue lens, or `null` for anything but the one known value. */
export function parseDeskQueueParam(raw: string | null | undefined): DeskQueueFilter | null {
  return String(raw ?? '').trim().toLowerCase() === 'pick' ? 'pick' : null;
}

/** Both lenses off one `URLSearchParams`-like reader. */
export function readDeskViewFilters(params: Pick<URLSearchParams, 'get'>): {
  pair: DeskPairFilter | null;
  queue: DeskQueueFilter | null;
} {
  return {
    pair: parseDeskPairParam(params.get(DESK_PAIR_PARAM)),
    queue: parseDeskQueueParam(params.get(DESK_QUEUE_PARAM)),
  };
}

/**
 * The Shortage desk has no "all pending" view: a request without a valid
 * `pair` is sent to `pair=po`, keeping every other param. Returns the search
 * string to redirect to (no leading `?`), or `null` when already canonical.
 */
export function shortageDeskRedirectSearch(
  params: Readonly<Record<string, string | string[] | undefined>>,
): string | null {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) next.append(key, v);
  }
  const current = next.getAll(DESK_PAIR_PARAM);
  if (current.length === 1 && current[0] === 'po') return null;
  next.set(DESK_PAIR_PARAM, 'po');
  return next.toString();
}

/** Coerce an untrusted counts payload to the five numbers (missing ⇒ 0). */
export function normalizeDeskCounts(raw: unknown): DeskCounts {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<DeskCountKey, number>;
  for (const key of DESK_COUNT_KEYS) {
    const n = Number(source[key]);
    out[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return out;
}
