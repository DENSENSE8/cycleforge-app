import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';

/**
 * Shared face geometry for station identity action pills.
 *
 * Kinetic Ledger / carton-context flush: `cornerClass('flush')` (square —
 * never `pill` / `rounded-full`). Internal `px-1.5` keeps glyph/text off the
 * border (same inset as serials "View All"). Chip-to-chip air stays zero via
 * {@link STATION_IDENTITY_ROW_CLASS}.
 *
 * Cite the `rounded-*` CLASS or a {@link cornerClass} role, never a raw token
 * name.
 */
const STATION_CONTEXT_ACTION_PILL_FACE = `shrink-0 gap-0 self-stretch ${cornerClass('flush')} border font-semibold tabular-nums shadow-none`;

/**
 * Boxed flush cube on a primary chrome row — carton Exit / Back-to-list and
 * Unbox Band-1 pin-list share this face. Height/width come from the host
 * (`h-full w-full` lead col, or `h-full aspect-square` on the workbench band).
 * Pair glyph with `h-3.5 w-3.5` — never IconButton.
 */
export const STATION_CONTEXT_BOXED_CUBE_CLASS = [
  'ds-raw-button relative z-base flex shrink-0 items-center justify-center',
  cornerClass('flush'),
  'border border-border-soft bg-surface-card p-0 text-text-soft shadow-none',
  'hover:bg-surface-hover/50 hover:text-text-muted',
  focusRing('control', 'accent'),
  'outline-none',
].join(' ');

/**
 * Exit / back-to-list — fills the lead square
 * ({@link STATION_IDENTITY_LEAD_COL_CLASS}) with {@link STATION_CONTEXT_BOXED_CUBE_CLASS}.
 */
export const STATION_CONTEXT_EXIT_PILL_CLASS = `${STATION_CONTEXT_BOXED_CUBE_CLASS} h-full w-full`;

/**
 * Locked width: camera left, count/plus right (`justify-between`) with inset
 * pad so neither face kisses the border — digit growth must not shift the row.
 * Height fills chrome row 1 (`h-full`) — never Button `size` height.
 */
export const STATION_CONTEXT_PHOTO_PILL_CLASS = `h-full ${STATION_CONTEXT_ACTION_PILL_FACE} w-14 justify-between px-1.5 text-role-caption border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700`;

/**
 * Square h-11 cell for Units explosion / joined serial rows — same blue face +
 * outline as {@link STATION_CONTEXT_PHOTO_PILL_CLASS}.
 */
export const STATION_CONTEXT_PHOTO_FLUSH_CLASS =
  `h-11 w-11 shrink-0 justify-center ${cornerClass('flush')} border border-blue-200 bg-blue-50 px-0 text-blue-700 hover:bg-blue-100 hover:text-blue-700`;

/**
 * Locked width matches Photos / status so Claim does not reflow the commerce
 * row. Fills secondary band row 2 (`h-6`). Typography matches classify pills
 * (`text-role-micro` + uppercase).
 */
export const STATION_CONTEXT_CLAIM_PILL_CLASS = `h-6 ${STATION_CONTEXT_ACTION_PILL_FACE} w-14 justify-center px-1.5 border-orange-200 bg-orange-50 text-role-micro font-medium uppercase tracking-wide text-orange-600 hover:bg-orange-100 hover:text-orange-700`;

/**
 * Carton lifecycle status — locked `w-14` face on commerce row 2 (replaces the
 * bare status dot). Tone classes come from
 * `getReceivingStatusPillClass` (rail status SoT); compose here for geometry.
 * Height matches {@link STATION_SECONDARY_BAND_FACE} (`h-6`).
 */
export const STATION_CONTEXT_STATUS_PILL_CLASS = `inline-flex h-6 w-14 min-w-14 max-w-14 shrink-0 items-center justify-center overflow-hidden px-1 ${cornerClass('flush')} border text-role-micro font-medium uppercase tracking-wide shadow-none box-border`;
