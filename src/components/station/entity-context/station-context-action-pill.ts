/**
 * Shared face for Claim + Photos pills in the station identity row.
 * Radius = DS `rounded-lg` (Button size sm / radii.lg) — one token for both.
 */
const STATION_CONTEXT_ACTION_PILL_CLASS =
  'h-8 shrink-0 gap-1 self-center rounded-lg border text-role-caption font-black tabular-nums shadow-sm';

/** Locked width: camera left, count/plus right — digit growth must not shift the row. */
export const STATION_CONTEXT_PHOTO_PILL_CLASS = `${STATION_CONTEXT_ACTION_PILL_CLASS} w-14 justify-between px-2.5 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700`;

/** Locked width matches the filed ticket# chip face so Claim ↔ ticket# does not reflow the row. */
export const STATION_CONTEXT_CLAIM_PILL_CLASS = `${STATION_CONTEXT_ACTION_PILL_CLASS} w-[50.2px] justify-center px-0 border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-700`;
