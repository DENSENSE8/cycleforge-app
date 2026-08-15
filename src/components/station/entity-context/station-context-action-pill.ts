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
 * Icon-only action cell on the one-row carton bar — square face filling the
 * chrome row, leading hairline only (row owns the bottom seam). Pair glyph
 * with `h-3.5 w-3.5`. Listing · claim · overflow share this cell.
 */
export const STATION_CONTEXT_ACTION_CELL_CLASS = [
  'ds-raw-button relative z-base flex h-full aspect-square shrink-0 items-center justify-center',
  cornerClass('flush'),
  'border-y-0 border-r-0 border-l border-border-soft bg-surface-card p-0 text-text-soft shadow-none',
  'hover:bg-surface-hover/50 hover:text-text-muted',
  focusRing('control', 'accent'),
  'outline-none',
].join(' ');

/**
 * Photos / Send-to-phone **tone** — the blue face shared by carton chrome
 * Photos, flush camera cells, and Unbox dock `PhotoStepDockStrip` phone third.
 *
 * Geometry (width · seam · pad) stays on the host classes below. Upgrade the
 * blue recipe HERE — never fork `bg-blue-50 text-blue-700` in a dock twin.
 */
export const STATION_CONTEXT_PHOTO_TONE =
  'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700';

/**
 * Photos on the one-row carton chrome — same cell geometry as listing/claim
 * (h-full, house inset, leading hairline) + {@link STATION_CONTEXT_PHOTO_TONE}
 * wash (the photos SoT). Camera + count; glyph is h-3.5, never the h-11 flush cube.
 */
export const STATION_CONTEXT_PHOTO_CHROME_CLASS = [
  'ds-raw-button relative z-base flex h-full shrink-0 items-center justify-center gap-0.5',
  cornerClass('flush'),
  'border-y-0 border-r-0 border-l px-1.5 text-role-caption font-semibold tabular-nums shadow-none',
  STATION_CONTEXT_PHOTO_TONE,
  focusRing('control', 'accent'),
  'outline-none',
].join(' ');

/**
 * Locked width: camera left, count/plus right (`justify-between`) with inset
 * pad so neither face kisses the border — digit growth must not shift the row.
 * Height fills chrome row 1 (`h-full`) — never Button `size` height.
 *
 * **Seam flush:** `border-b-0 border-r-0` — the row owns the bottom hairline
 * ({@link STATION_CHROME_SEAM_HAIRLINE}); the Displays / utility `border-l` owns
 * the trailing vertical rule. Never stack Photos' own bottom+right borders
 * against Claim / Displays (that doubles the seam and optically shifts it).
 */
export const STATION_CONTEXT_PHOTO_PILL_CLASS = `h-full ${STATION_CONTEXT_ACTION_PILL_FACE} w-14 justify-between px-1.5 text-role-caption border-b-0 border-r-0 ${STATION_CONTEXT_PHOTO_TONE}`;

/**
 * Square h-11 cell for Units explosion / joined serial rows — same blue face +
 * outline as {@link STATION_CONTEXT_PHOTO_PILL_CLASS}.
 */
export const STATION_CONTEXT_PHOTO_FLUSH_CLASS =
  `h-11 w-11 shrink-0 justify-center ${cornerClass('flush')} border px-0 ${STATION_CONTEXT_PHOTO_TONE}`;

/**
 * Locked width matches Photos so Claim does not reflow the commerce row.
 * Status is content-width (full lifecycle label). Fills secondary band row 2
 * (`h-6`). Typography matches classify pills (`text-role-micro` + uppercase).
 *
 * **Seam flush:** `border-t-0 border-r-0` — pairs with Photos above; trailing
 * vertical rule is the Displays / utility hairline, not a second Claim border.
 */
export const STATION_CONTEXT_CLAIM_PILL_CLASS = `h-6 ${STATION_CONTEXT_ACTION_PILL_FACE} w-14 justify-center px-1.5 border-t-0 border-r-0 border-orange-200 bg-orange-50 text-role-micro font-medium uppercase tracking-wide text-orange-600 hover:bg-orange-100 hover:text-orange-700`;

/**
 * Carton lifecycle status — content-width face on commerce row 2 (replaces the
 * bare status dot). Sizes to the full label (Incoming · Received · …) — never
 * a locked `w-14` that truncates. Tone classes come from
 * `getReceivingStatusPillClass` (rail status SoT); compose here for geometry.
 * Height matches {@link STATION_SECONDARY_BAND_FACE} (`h-6`).
 */
export const STATION_CONTEXT_STATUS_PILL_CLASS = `inline-flex h-6 w-auto shrink-0 items-center justify-center whitespace-nowrap px-1.5 ${cornerClass('flush')} border text-role-micro font-medium uppercase tracking-wide shadow-none box-border`;
