/**
 * Shared face for Claim + Photos pills in the station identity row.
 * Radius = DS `rounded-lg` (Button size sm / radii.lg) — one token for both.
 */
const STATION_CONTEXT_ACTION_PILL_CLASS =
  'h-8 shrink-0 gap-1 self-center rounded-lg border px-2.5 text-role-caption font-black tabular-nums shadow-sm';

export const STATION_CONTEXT_PHOTO_PILL_CLASS = `${STATION_CONTEXT_ACTION_PILL_CLASS} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700`;

export const STATION_CONTEXT_CLAIM_PILL_CLASS = `${STATION_CONTEXT_ACTION_PILL_CLASS} border-orange-200 bg-orange-50 uppercase tracking-wide text-orange-700 hover:bg-orange-100 hover:text-orange-700`;
