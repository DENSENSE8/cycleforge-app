import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
import {
  STATION_CHROME_CELL_CLASS_MARK,
  STATION_CHROME_TONE_CLASS_MARK,
  STATION_CHROME_CELL_INK,
  STATION_CHROME_CELL_LABEL,
  STATION_CHROME_CELL_TEXT,
} from './station-identity-chrome';

/** Shared face geometry for station identity action pills. */
const STATION_CONTEXT_ACTION_PILL_FACE = `shrink-0 gap-0 self-stretch ${cornerClass('flush')} border ${STATION_CHROME_CELL_TEXT} shadow-none`;

/** Photos / Send-to-phone **tone** — the blue face shared by carton chrome Photos, flush camera cells, and Unbox dock `PhotoStepDockStrip`… */
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
  'bg-surface-hover text-text-soft hover:text-text-muted';

/** Local-pickup tone — a solid emerald fill, the one carton-bar cell that states a fulfilment FACT rather than offering an action ("this… */
const STATION_CONTEXT_PICKUP_TONE = 'border-emerald-600 bg-emerald-600 text-white';

/** Neutral WORD face — listing: default ink on the house card surface. */
const STATION_CONTEXT_NEUTRAL_TONE =
  `bg-surface-card ${STATION_CHROME_CELL_INK} disabled:text-text-faint`;

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
  /** Icon + count (Photos). */
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
 * Tones that paint their OWN hover wash and must not take the neutral one on
 * top of it — Photos stays blue, Claim stays orange, Pickup stays emerald.
 * Everything else takes the house fill from the row rule.
 */
const TONE_OWNS_WASH = new Set<keyof typeof FACE_TONE>(['photo', 'claim', 'pickup']);

/** Type face for a cell's CONTENT. */
const FACE_TEXT = {
  glyph: '',
  value: STATION_CHROME_CELL_TEXT,
  label: STATION_CHROME_CELL_LABEL,
} as const;

/** **The one carton-bar button face.** Every clickable cell on the strip is a `(box, tone, text)` of this builder — exit, overflow `⋯`,… */
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
  /** `false` for a cell that STATES rather than acts (the Pickup fact). */
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
    // The row owns the hover display (see `.cf-chrome-row` in globals.css).
    STATION_CHROME_CELL_CLASS_MARK,
    // Photos blue / Claim orange / Pickup emerald keep their own wash; the
    // marker tells the row rule to leave the background alone. They still take
    // the box, so the strip delineates uniformly under a pointer sweep.
    TONE_OWNS_WASH.has(tone) ? STATION_CHROME_TONE_CLASS_MARK : '',
    interactive ? focusRing('control', 'accent') : '',
    interactive ? 'outline-none' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Flush cube on a primary chrome row — Unbox Band-1 pin-list, Photo Library scope cube, and workbench chrome cubes share this face. */
export const STATION_CONTEXT_BOXED_CUBE_CLASS = stationContextFace({
  box: 'cube',
  tone: 'quiet',
  bordered: false,
});

/** Exit / back-to-list — fills the lead square ({@link STATION_IDENTITY_LEAD_COL_CLASS}). */
export const STATION_CONTEXT_EXIT_PILL_CLASS = stationContextFace({
  box: 'lead',
  tone: 'neutral',
});

/** Icon-only action cell on the one-row carton bar — square face filling the chrome row, no cell hairline (the bar is one continuous strip;… */
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

/** Locked width: */
export const STATION_CONTEXT_PHOTO_PILL_CLASS = `h-full ${STATION_CONTEXT_ACTION_PILL_FACE} w-14 justify-between px-1.5 border-b-0 border-r-0 ${STATION_CONTEXT_PHOTO_TONE}`;

/**
 * Square h-11 cell for Units explosion / joined serial rows — same blue face +
 * outline as {@link STATION_CONTEXT_PHOTO_PILL_CLASS}.
 */
export const STATION_CONTEXT_PHOTO_FLUSH_CLASS =
  `h-11 w-11 shrink-0 justify-center ${cornerClass('flush')} border px-0 ${STATION_CONTEXT_PHOTO_TONE}`;

/** Local-pickup cell in the carton bar's tracking slot — same word geometry as Listing / Claim, emerald fill, no focus ring (it is a fact,… */
export const STATION_CONTEXT_PICKUP_CHROME_CLASS = stationContextFace({
  box: 'word',
  tone: 'pickup',
  text: 'label',
  interactive: false,
});
