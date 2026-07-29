import { cornerClass } from '@/design-system/tokens/radius';

/**
 * Shared face for Claim + Photos pills in the station identity row.
 *
 * Corner = `pill`, on the shared base so the two can never drift apart. Both are
 * `h-8` (32px) sitting on the station bookmark card, whose surface is
 * `rounded-2xl` (16px) — and at 32px tall a 16px corner already IS a stadium, so
 * `pill` matches the card's corner exactly and stays right if that radius is
 * ever retuned. Previously `rounded-lg` (8px), which read as small square
 * buttons floating on a much rounder surface.
 *
 * Cite the `rounded-*` CLASS or a {@link cornerClass} role, never a raw token
 * name: `tokens/radius.ts` used to sit one step above the classes, and the old
 * comment here paired `rounded-lg` with `radius.lg` as "one token for both",
 * which was wrong by 4px.
 */
const STATION_CONTEXT_ACTION_PILL_CLASS = `h-8 shrink-0 gap-1 self-center ${cornerClass('pill')} border text-role-caption font-semibold tabular-nums shadow-sm`;

/** Locked width: camera left, count/plus right — digit growth must not shift the row. */
export const STATION_CONTEXT_PHOTO_PILL_CLASS = `${STATION_CONTEXT_ACTION_PILL_CLASS} w-14 justify-between px-2.5 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700`;

/** Locked width matches the filed ticket# chip face so Claim ↔ ticket# does not reflow the row.
 * Typography matches classify pills (`text-role-micro` + uppercase) — quieter than the photo pill's `font-black`. */
export const STATION_CONTEXT_CLAIM_PILL_CLASS = `${STATION_CONTEXT_ACTION_PILL_CLASS} w-[50.2px] justify-center px-0 border-orange-200 bg-orange-50 text-role-micro font-medium uppercase tracking-wide text-orange-600 hover:bg-orange-100 hover:text-orange-700`;
