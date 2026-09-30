/** Outbound desk lens filters — the parked Shortage desk's `pair=po` lens and the To-ship refinements: */

import { DESK_PAIR_PARAM, type DeskCountKey } from '@/lib/outbound/desk-views';
import { isDateKey, parseDateKey } from '@/utils/date';

export type DeskPairFilter = 'po';

/** `GET /api/orders/desk-counts` payload. */
export type DeskCounts = Readonly<Record<DeskCountKey, number>>;

const DESK_COUNT_KEYS: readonly DeskCountKey[] = ['exceptions', 'po', 'triage', 'shippedToday'];

/** `?pair=` → the pairing lens, or `null` for anything but the one known value. */
export function parseDeskPairParam(raw: string | null | undefined): DeskPairFilter | null {
  return String(raw ?? '').trim().toLowerCase() === 'po' ? 'po' : null;
}

/**
 * Unshipped-desk refinements (`/api/orders` and the outbound nav facets read
 * them through this one parse). Absent or invalid ⇒ `null` = no filter.
 * Dates are warehouse civil days (`YYYY-MM-DD`, inclusive).
 */
export interface DeskRefinements {
  /** `?packedBy=` — the latest live PACK assignee. */
  packedBy: number | null;
  /** `?pickerId=` — the latest live ORDER/PICK assignee (the order-desk operator). */
  pickerId: number | null;
  /** `?pickedBy=` — the staffer who actually picked the order. */
  pickedBy: number | null;
  /** `?orderFrom=` / `?orderTo=` — order date. */
  orderFrom: string | null;
  orderTo: string | null;
  /** `?shipByFrom=` / `?shipByTo=` — ship-by deadline; either bound drops orders without one. */
  shipByFrom: string | null;
  shipByTo: string | null;
}

/** Positive integer id (digits only), else `null`. */
export function parseStaffIdParam(raw: string | null | undefined): number | null {
  const value = String(raw ?? '').trim();
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Valid `YYYY-MM-DD` calendar day, else `null`. */
export function parseDayParam(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim();
  return isDateKey(value) && parseDateKey(value) ? value : null;
}

export function readDeskRefinements(params: Pick<URLSearchParams, 'get'>): DeskRefinements {
  return {
    packedBy: parseStaffIdParam(params.get('packedBy')),
    pickerId: parseStaffIdParam(params.get('pickerId')),
    pickedBy: parseStaffIdParam(params.get('pickedBy')),
    orderFrom: parseDayParam(params.get('orderFrom')),
    orderTo: parseDayParam(params.get('orderTo')),
    shipByFrom: parseDayParam(params.get('shipByFrom')),
    shipByTo: parseDayParam(params.get('shipByTo')),
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

/** Coerce an untrusted counts payload to the four numbers (missing ⇒ 0). */
export function normalizeDeskCounts(raw: unknown): DeskCounts {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as Record<DeskCountKey, number>;
  for (const key of DESK_COUNT_KEYS) {
    const n = Number(source[key]);
    out[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return out;
}
