import { cornerClass } from '@/design-system/tokens/radius';

/**
 * Shared face for Claim + Photos controls in the station identity row.
 *
 * Kinetic Ledger / carton-context flush: `cornerClass('flush')` (square —
 * never `pill` / `rounded-full`). Internal `px-1.5` keeps glyph/text off the
 * border (same inset as serials "View All"); Photos uses `justify-between` so
 * camera · count/+ pin to the inset edges when a count is showing. Chip-to-chip
 * air stays zero via {@link STATION_IDENTITY_ROW_CLASS}.
 *
 * Cite the `rounded-*` CLASS or a {@link cornerClass} role, never a raw token
 * name.
 */
const STATION_CONTEXT_ACTION_PILL_CLASS = `h-8 shrink-0 gap-0 self-center ${cornerClass('flush')} border text-role-caption font-semibold tabular-nums shadow-none`;

/**
 * Exit / back chevron — same h-8 flush boxed face as Claim · Photos · classify
 * pills so the lead column reads as one instrument strip, not a bare glyph.
 */
export const STATION_CONTEXT_EXIT_PILL_CLASS = `inline-flex h-8 w-8 shrink-0 items-center justify-center ${cornerClass('flush')} border border-border-soft bg-surface-card text-text-faint shadow-none hover:bg-surface-hover hover:text-text-muted`;

/**
 * Locked width: camera left, count/plus right (`justify-between`) with inset
 * pad so neither face kisses the border — digit growth must not shift the row.
 */
export const STATION_CONTEXT_PHOTO_PILL_CLASS = `${STATION_CONTEXT_ACTION_PILL_CLASS} w-14 justify-between px-1.5 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700`;

/**
 * Square h-11 cell for Units explosion / joined serial rows — same blue face +
 * outline as {@link STATION_CONTEXT_PHOTO_PILL_CLASS}.
 */
export const STATION_CONTEXT_PHOTO_FLUSH_CLASS =
  `h-11 w-11 shrink-0 justify-center ${cornerClass('flush')} border border-blue-200 bg-blue-50 px-0 text-blue-700 hover:bg-blue-100 hover:text-blue-700`;

/**
 * Locked width matches Photos so Claim ↔ Photos does not reflow the row.
 * Same `px-1.5` inset as Photos / serials View All — "CLAIM" stays off the
 * border. Typography matches classify pills (`text-role-micro` + uppercase).
 */
export const STATION_CONTEXT_CLAIM_PILL_CLASS = `${STATION_CONTEXT_ACTION_PILL_CLASS} w-14 justify-center px-1.5 border-orange-200 bg-orange-50 text-role-micro font-medium uppercase tracking-wide text-orange-600 hover:bg-orange-100 hover:text-orange-700`;
