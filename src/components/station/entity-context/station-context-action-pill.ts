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
 * Photos / Send-to-phone **tone** — the blue face shared by carton chrome
 * Photos, flush camera cells, and Unbox dock `PhotoStepDockStrip` phone third.
 *
 * Geometry (width · seam · pad) stays on the host classes below. Upgrade the
 * blue recipe HERE — never fork `bg-blue-50 text-blue-700` in a dock twin.
 */
export const STATION_CONTEXT_PHOTO_TONE =
  'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-700';

/**
 * Claim tone — orange wash twin of {@link STATION_CONTEXT_PHOTO_TONE}.
 * Upgrade the orange recipe HERE.
 */
const STATION_CONTEXT_CLAIM_TONE =
  'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-700';

/**
 * Quiet chrome face — exit, overflow, boxed cube. Glyph-only, so it carries no
 * type token at all. Whisper `surface-hover` fill (same recipe as Band-1 Check
 * `execute`) so the cell reads as a control without a rest-state hairline box.
 */
const STATION_CONTEXT_QUIET_TONE =
  `bg-surface-hover text-text-soft ${STATION_CHROME_CELL_HOVER_FILL} hover:text-text-muted`;

/**
 * Local-pickup tone — a solid emerald fill, the one carton-bar cell that states
 * a fulfilment FACT rather than offering an action ("this carton has no
 * tracking number because a human carried it out"). Solid, not a wash, because
 * it replaces an identifier rather than decorating one.
 */
const STATION_CONTEXT_PICKUP_TONE = 'border-emerald-600 bg-emerald-600 text-white';

/** Neutral WORD face — listing: default ink on the house card surface. */
const STATION_CONTEXT_NEUTRAL_TONE =
  `bg-surface-card ${STATION_CHROME_CELL_INK} ${STATION_CHROME_CELL_HOVER_FILL} disabled:text-text-faint`;

/** Cell geometry. Type + surface come from the tone, never from the box. */
const FACE_BOX = {
  /** Host supplies h/w (`h-full w-full` lead col, or `h-full aspect-square`). */
  cube: 'p-0',
  /** Fills the lead square ({@link STATION_IDENTITY_LEAD_COL_CLASS}). */
  lead: 'h-full w-full p-0',
  /** Icon-only cell on the one-row bar. */
  square: 'h-full aspect-square p-0',
  /** Icon + word (Claim, Listing, Pickup) — content width. */
  word: 'h-full min-h-0 self-stretch gap-0.5 leading-none px-1.5',
  /**
   * Icon + count (Photos). **`w-11` (44px) is a lock, not a suggestion.** Left
   * content-sized, the cell grew and shrank with the photo count — 1 → 2 → 10
   * photos each produced a different width, and because Photos sits in the
   * trailing cluster every cell to its left shifted horizontally as an operator
   * captured. A fixed track keeps the strip still. Camera (h-3.5) + `gap-0.5` +
   * a two-digit count at {@link STATION_CHROME_CELL_TEXT} measures ~42px inside
   * `px-1.5`, so 44 holds it centred with a hair of room; a three-digit count is
   * intentionally allowed to fill the track rather than widen it.
   */
  count: 'h-full w-11 min-h-0 self-stretch gap-0.5 leading-none px-1.5',
} as const;

const FACE_TONE = {
  quiet: STATION_CONTEXT_QUIET_TONE,
  neutral: STATION_CONTEXT_NEUTRAL_TONE,
  photo: STATION_CONTEXT_PHOTO_TONE,
  claim: STATION_CONTEXT_CLAIM_TONE,
  pickup: STATION_CONTEXT_PICKUP_TONE,
} as const;

/**
 * Type face for a cell's CONTENT. `glyph` cells carry none — declaring a type
 * token on an icon-only face is how a scale leaks onto the strip.
 *
 * Two faces, one scale: `value` is mono (IDs, money, counts — character-by-
 * character scanning, tabular figures), `label` is proportional (words). See
 * `station-identity-chrome.ts` — family is the ONLY axis permitted to vary.
 */
const FACE_TEXT = {
  glyph: '',
  value: STATION_CHROME_CELL_TEXT,
  label: STATION_CHROME_CELL_LABEL,
} as const;

/**
 * **The one carton-bar button face.** Every clickable cell on the strip is a
 * `(box, tone, text)` of this builder — exit, overflow `⋯`, Photos, Claim,
 * Listing, Pickup, and the workbench boxed cube.
 *
 * They were six hand-maintained class arrays that each re-spelled
 * `ds-raw-button relative z-base flex … cornerClass('flush') … focusRing …`.
 * Six copies of one recipe cannot be corrected once: a fix to the hover seam,
 * the focus ring or the flush corner landed on whichever copies the author
 * happened to open. The axes that genuinely differ per cell are exactly three,
 * and they are now named arguments rather than diffs between six literals.
 *
 * `bordered` is the cube's own axis: the bar is ONE continuous strip, so every
 * cell that lives on it is borderless (the row owns the bottom seam and the
 * Displays rail owns the trailing rule). Only a cell that floats off the strip
 * draws its own box.
 */
// Internal on purpose: a cell OUTSIDE this module imports the named face it
// needs (STATION_CONTEXT_*), so the roster of legal faces stays enumerable here
// rather than becoming "whatever arguments a caller invented".
function stationContextFace({
  box,
  tone,
  text = 'glyph',
  bordered = false,
  interactive = true,
}: {
  box: keyof typeof FACE_BOX;
  tone: keyof typeof FACE_TONE;
  text?: keyof typeof FACE_TEXT;
  bordered?: boolean;
  /**
   * `false` for a cell that STATES rather than acts (the Pickup fact). It drops
   * the raw-button escape and the focus ring — a `<span>` carrying either is
   * lying about being operable — and keeps the geometry, so a fact cell still
   * measures identically to the buttons beside it.
   */
  interactive?: boolean;
}): string {
  return [
    interactive ? 'ds-raw-button' : '',
    'relative z-base flex shrink-0 items-center justify-center',
    cornerClass('flush'),
    bordered ? 'border border-border-soft' : 'border-0',
    FACE_BOX[box],
    FACE_TEXT[text],
    FACE_TONE[tone],
    'shadow-none',
    STATION_CHROME_CELL_HOVER_SEAM,
    interactive ? focusRing('control', 'accent') : '',
    interactive ? 'outline-none' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Flush cube on a primary chrome row — Unbox Band-1 pin-list, Photo Library
 * scope cube, and workbench chrome cubes share this face. **No rest-state
 * border** — same flush grammar as Check / Band-1 CTAs (hover seam only).
 * Height/width come from the host (`h-full w-full` lead col, or
 * `h-full aspect-square` on the workbench band). Pair glyph with `h-3.5 w-3.5`
 * — never IconButton.
 */
export const STATION_CONTEXT_BOXED_CUBE_CLASS = stationContextFace({
  box: 'cube',
  tone: 'quiet',
  bordered: false,
});

/**
 * Exit / back-to-list — fills the lead square
 * ({@link STATION_IDENTITY_LEAD_COL_CLASS}). White rest like identity IDs
 * ({@link STATION_CONTEXT_NEUTRAL_TONE}); shared chrome hover fill — never
 * the quiet `surface-hover` slab.
 */
export const STATION_CONTEXT_EXIT_PILL_CLASS = stationContextFace({
  box: 'lead',
  tone: 'neutral',
});

/**
 * Icon-only action cell on the one-row carton bar — square face filling the
 * chrome row, no cell hairline (the bar is one continuous strip; the row owns
 * the bottom seam). Pair glyph with `h-3.5 w-3.5`. Overflow only.
 * Listing is the word face ({@link STATION_CONTEXT_LISTING_CHROME_CLASS}); Claim
 * is {@link STATION_CONTEXT_CLAIM_CHROME_CLASS}. Never put `IconButton` on this
 * row — `size="sm"` is a fixed h-7 w-7 box that sits off the strip.
 */
export const STATION_CONTEXT_ACTION_CELL_CLASS = stationContextFace({
  box: 'square',
  tone: 'quiet',
});

/**
 * Photos on the one-row carton chrome — same cell geometry as listing/claim
 * (h-full, house inset, no leading hairline) + {@link STATION_CONTEXT_PHOTO_TONE}
 * wash (the photos SoT). Camera + count; glyph is h-3.5, never the h-11 flush cube.
 */
export const STATION_CONTEXT_PHOTO_CHROME_CLASS = stationContextFace({
  box: 'count',
  tone: 'photo',
  text: 'value',
});

/**
 * Claim on the one-row carton chrome — same geometry as Photos
 * ({@link STATION_CONTEXT_PHOTO_CHROME_CLASS}): h-full, icon left + word right.
 * Ticket + "Claim". Never IconButton. Linked tickets stay ReceivingTicketChip.
 */
export const STATION_CONTEXT_CLAIM_CHROME_CLASS = stationContextFace({
  box: 'word',
  tone: 'claim',
  text: 'label',
});

/**
 * Listing on the one-row carton chrome — same geometry as Claim / Photos.
 * ExternalLink + platform catalog name (eBay, Goodwill, …). Glyph paint comes
 * from {@link platformMetaIconTone} on the icon span; the word stays default ink.
 */
export const STATION_CONTEXT_LISTING_CHROME_CLASS = stationContextFace({
  box: 'word',
  tone: 'neutral',
  text: 'label',
});

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
 * Local-pickup cell in the carton bar's tracking slot — same word geometry as
 * Listing / Claim, emerald fill, no focus ring (it is a fact, not a control).
 *
 * It was a page-local `RAIL_PILL_BASE` in `ReceivingIdentityChips.tsx` whose
 * comment claimed it "matches InlinePillPicker" while spelling
 * `text-role-micro uppercase tracking-wide px-2.5` — 10px condensed shouting
 * next to 12px sentence-case cells, i.e. exactly the second type system
 * `carton-chrome-type-unity.guard.test.ts` exists to keep off this strip. The
 * guard could not see it because the fork lived outside the two files it reads.
 */
export const STATION_CONTEXT_PICKUP_CHROME_CLASS = stationContextFace({
  box: 'word',
  tone: 'pickup',
  text: 'label',
  interactive: false,
});
