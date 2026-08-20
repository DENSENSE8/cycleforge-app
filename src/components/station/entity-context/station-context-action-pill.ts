import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import {
  STATION_CHROME_CELL_HOVER_FILL,
  STATION_CHROME_CELL_HOVER_SEAM,
  STATION_CHROME_CELL_INK,
  STATION_CHROME_CELL_LABEL,
  STATION_CHROME_CELL_TEXT,
} from './station-identity-chrome';

/**
 * Shared face geometry for station identity action pills.
 *
 * Kinetic Ledger / carton-context flush: `cornerClass('flush')` (square —
 * never `pill` / `rounded-full`). Internal `px-1.5` keeps glyph/text off the
 * border (same inset as serials "View All"). Chip-to-chip air stays zero via
 * {@link STATION_CHROME_ROW_FACE}.
 *
 * Cite the `rounded-*` CLASS or a {@link cornerClass} role, never a raw token
 * name.
 */
const STATION_CONTEXT_ACTION_PILL_FACE = `shrink-0 gap-0 self-stretch ${cornerClass('flush')} border ${STATION_CHROME_CELL_TEXT} shadow-none`;

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
  `${STATION_CHROME_CELL_HOVER_FILL} hover:text-text-muted`,
  STATION_CHROME_CELL_HOVER_SEAM,
  focusRing('control', 'accent'),
  'outline-none',
].join(' ');

/**
 * Exit / back-to-list — fills the lead square
 * ({@link STATION_IDENTITY_LEAD_COL_CLASS}). Same hover/focus as the boxed
 * cube, but borderless so the carton bar reads as one continuous strip.
 */
export const STATION_CONTEXT_EXIT_PILL_CLASS = [
  'ds-raw-button relative z-base flex h-full w-full shrink-0 items-center justify-center',
  cornerClass('flush'),
  'border-0 bg-surface-card p-0 text-text-soft shadow-none',
  `${STATION_CHROME_CELL_HOVER_FILL} hover:text-text-muted`,
  STATION_CHROME_CELL_HOVER_SEAM,
  focusRing('control', 'accent'),
  'outline-none',
].join(' ');

/**
 * Icon-only action cell on the one-row carton bar — square face filling the
 * chrome row, no cell hairline (the bar is one continuous strip; the row owns
 * the bottom seam). Pair glyph with `h-3.5 w-3.5`. Overflow only.
 * Listing is the word face ({@link STATION_CONTEXT_LISTING_CHROME_CLASS}); Claim
 * is {@link STATION_CONTEXT_CLAIM_CHROME_CLASS}. Never put `IconButton` on this
 * row — `size="sm"` is a fixed h-7 w-7 box that sits off the strip.
 */
export const STATION_CONTEXT_ACTION_CELL_CLASS = [
  'ds-raw-button relative z-base flex h-full aspect-square shrink-0 items-center justify-center',
  cornerClass('flush'),
  'border-0 bg-surface-card p-0 text-text-soft shadow-none',
  `${STATION_CHROME_CELL_HOVER_FILL} hover:text-text-muted`,
  STATION_CHROME_CELL_HOVER_SEAM,
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
 * (h-full, house inset, no leading hairline) + {@link STATION_CONTEXT_PHOTO_TONE}
 * wash (the photos SoT). Camera + count; glyph is h-3.5, never the h-11 flush cube.
 */
export const STATION_CONTEXT_PHOTO_CHROME_CLASS = [
  'ds-raw-button relative z-base flex h-full shrink-0 items-center justify-center gap-0.5 leading-none',
  cornerClass('flush'),
  `border-0 px-1.5 ${STATION_CHROME_CELL_TEXT} shadow-none`,
  STATION_CONTEXT_PHOTO_TONE,
  STATION_CHROME_CELL_HOVER_SEAM,
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
export const STATION_CONTEXT_PHOTO_PILL_CLASS = `h-full ${STATION_CONTEXT_ACTION_PILL_FACE} w-14 justify-between px-1.5 border-b-0 border-r-0 ${STATION_CONTEXT_PHOTO_TONE}`;

/**
 * Square h-11 cell for Units explosion / joined serial rows — same blue face +
 * outline as {@link STATION_CONTEXT_PHOTO_PILL_CLASS}.
 */
export const STATION_CONTEXT_PHOTO_FLUSH_CLASS =
  `h-11 w-11 shrink-0 justify-center ${cornerClass('flush')} border px-0 ${STATION_CONTEXT_PHOTO_TONE}`;

/**
 * Claim tone — orange wash twin of {@link STATION_CONTEXT_PHOTO_TONE}.
 * Upgrade the orange recipe HERE.
 */
const STATION_CONTEXT_CLAIM_TONE =
  'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-700';

/**
 * Claim on the one-row carton chrome — same geometry as Photos
 * ({@link STATION_CONTEXT_PHOTO_CHROME_CLASS}): h-full, icon left + word right.
 * Ticket + "Claim". Never IconButton. Linked tickets stay ReceivingTicketChip.
 */
export const STATION_CONTEXT_CLAIM_CHROME_CLASS = [
  'ds-raw-button relative z-base flex h-full shrink-0 items-center justify-center gap-0.5 leading-none',
  cornerClass('flush'),
  `border-0 px-1.5 ${STATION_CHROME_CELL_LABEL} shadow-none`,
  STATION_CONTEXT_CLAIM_TONE,
  STATION_CHROME_CELL_HOVER_SEAM,
  focusRing('control', 'accent'),
  'outline-none',
].join(' ');

/**
 * Listing on the one-row carton chrome — same geometry as Claim / Photos.
 * ExternalLink + platform catalog name (eBay, Goodwill, …). Glyph paint comes
 * from {@link platformMetaIconTone} on the icon span; the word stays default ink.
 */
export const STATION_CONTEXT_LISTING_CHROME_CLASS = [
  'ds-raw-button relative z-base flex h-full shrink-0 items-center justify-center gap-0.5 leading-none',
  cornerClass('flush'),
  `border-0 bg-surface-card px-1.5 ${STATION_CHROME_CELL_LABEL} ${STATION_CHROME_CELL_INK} shadow-none`,
  `${STATION_CHROME_CELL_HOVER_FILL} disabled:text-text-faint`,
  STATION_CHROME_CELL_HOVER_SEAM,
  focusRing('control', 'accent'),
  'outline-none',
].join(' ');

