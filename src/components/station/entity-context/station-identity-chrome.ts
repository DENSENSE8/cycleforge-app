/** Station identity chrome — coplanar flush band under GlobalHeader. */
import {
  HEADER_ICON_GAP,
} from '@/components/layout/header-shell';
import { elevationClass } from '@/design-system/tokens/shadows';
import { chipLabel, chipText } from '@/design-system/tokens/typography/presets';

/** Flat plane — no lift on the identity band. */
const STATION_IDENTITY_ELEVATION = elevationClass('flat');

/** Absolute identity host — flush under GlobalHeader. */
export const STATION_IDENTITY_INSET_TOP = 'top-0';

/** Trailing inset for more-details / corner utilities. */
export const STATION_IDENTITY_INSET_RIGHT = 'right-2';

/**
 * Absolute float host for {@link StationContextBar} — click-through outer;
 * children re-enable with `pointer-events-auto`. Pairs with
 * {@link STATION_IDENTITY_STACKED_SCROLL_CLEARANCE} on the workbench body.
 */
export const stationContextBarHostClass =
  `pointer-events-none absolute inset-x-0 ${STATION_IDENTITY_INSET_TOP} z-raised`;

/** In-flow host for {@link StationContextBar} — identity is a shrink-0 sibling above the workbench scroll port so the hairline bottom abuts… */
export const stationContextBarFlowHostClass = 'relative shrink-0';

/** Identity strip — coplanar flush white face on the locked 720 measure: */
export const stationIdentityPanelClass =
  `rounded-none border-0 bg-surface-card ${STATION_IDENTITY_ELEVATION}`;

/**
 * Top-right utilities shell — same flush white recipe as the identity strip.
 */
export const stationUtilityPanelClass =
  `rounded-none border-0 bg-surface-card ${STATION_IDENTITY_ELEVATION}`;

/**
 * Inner pad for flush identity / utility faces — zero on all sides so
 * GlobalHeader → identity → body read as one floor with no side air.
 */
export const stationIdentityPadClass = 'px-0';

/* ── Identity rhythm (one-row carton bar; stacked tokens kept for overlays) ─ */

/** Station chrome seam — carton identity row 1, Displays push top, and desk inspector chrome (`DeskRailChromeRow` / leaf band / host `X`). */
export const STATION_CHROME_ROW_FACE = 'h-7 max-h-7 min-h-0 shrink-0';

/** Bottom hairline on a station chrome row — painted via `after:` so it does **not** eat the `h-7` / `h-6` box (border-box `border-b` would… */
export const STATION_CHROME_SEAM_HAIRLINE =
  'relative after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border-subtle';

/** Square hit cell on the Displays top band — same 28px as {@link STATION_CHROME_ROW_FACE} and `IconButton size="sm"`. */
export const STATION_DISPLAYS_PUSH_TOP_CELL =
  'pointer-events-auto flex h-full w-7 shrink-0 items-stretch';

/**
 * Trailing cluster on the Displays top band — verbs · ⤢ · X. Same
 * {@link HEADER_ICON_GAP} (`gap-0`) as GlobalHeader and carton identity;
 * hover seam is the divider. Never a nested `gap-0.5`.
 */
export const STATION_DISPLAYS_PUSH_TOP_CLUSTER =
  `pointer-events-auto flex h-full shrink-0 items-stretch ${HEADER_ICON_GAP}`;

/** Displays / desk-inspector top chrome row — same face as carton identity ({@link STATION_CHROME_ROW_FACE}). */
/** Desk inspector top band for panels whose BODY carries a `px-4` content gutter — the eyebrow's ink lands on the body's own left edge… */
export const DESK_INSPECTOR_GUTTER_TOP_BAND =
  `relative z-header flex ${STATION_CHROME_ROW_FACE} items-stretch gap-1.5 pl-4 pr-0 ${STATION_CHROME_SEAM_HAIRLINE}`;

export const STATION_DISPLAYS_PUSH_TOP_BAND =
  `pointer-events-none relative z-header flex ${STATION_CHROME_ROW_FACE} items-stretch ${HEADER_ICON_GAP} pr-0 ${STATION_CHROME_SEAM_HAIRLINE}`;

/** Classify urgency·platform·type — **one token**: */
export const STATION_IDENTITY_GROUP_CLASS =
  'flex h-full min-h-0 items-stretch gap-0';

/** Leading column on chrome row 1 — boxed exit chevron. */
export const STATION_IDENTITY_LEAD_COL_CLASS =
  'flex h-full aspect-square shrink-0 items-stretch justify-stretch';

/**
 * Identity cells after back are unruled — same flush abut as Band-1 CTAs.
 * Order # · tracking # are facts about one carton; a vertical rule between
 * back and the first cell is retired so navigation and identity sit as one row.
 */

/**
 * House inset for identity / action cells that are not a chip face.
 * Same `px-1.5` as CopyChip `outerPad="chip"` and action-pill faces —
 * do not invent a second pad scale.
 */
export const STATION_CHROME_CELL_PAD = 'px-1.5';

/** Text face for EVERY cell on the one-row carton bar — alias of the house {@link chipText} preset, so the bar and dense CopyChips… */
export const STATION_CHROME_CELL_TEXT = chipText;

/** Word face for bar cells whose content is a LABEL, not a value — Claim, the platform name, the classify pills. */
export const STATION_CHROME_CELL_LABEL = chipLabel;

/** Default label ink for a neutral (non-tone) bar cell — order #, tracking, ticket, price, listing. */
export const STATION_CHROME_CELL_INK = 'text-text-default';

/**
 * Chrome glyph box — same optical size as exit / back (`h-3.5`).
 * Listing · claim · photos · price mark · overflow all use this box.
 */
export const STATION_CHROME_GLYPH_CLASS = 'block h-3.5 w-3.5 shrink-0';



/** **The hover display for a station chrome row — opt in, don't compose.** */
export const STATION_CHROME_ROW_CLASS = 'cf-chrome-row';

/** Cell opt-in. Rides inside the shared cell classes below — see the CSS. */
export const STATION_CHROME_CELL_CLASS_MARK = 'cf-chrome-cell';

/**
 * Cell that steps its OWN wash (Photos blue, Claim orange, Pickup emerald) and
 * therefore skips the neutral fill. It still takes the box — the strip
 * delineates uniformly; only the colour of the wash is the tone's business.
 */
export const STATION_CHROME_TONE_CLASS_MARK = 'cf-chrome-tone';


/** Interactive cell on the carton bar that is NOT one of the button faces in `station-context-action-pill.ts` — i.e. */
export const STATION_CHROME_HOVER_CELL_CLASS = [
  'flex h-full min-h-0 shrink-0 items-stretch',
  STATION_CHROME_CELL_CLASS_MARK,
].join(' ');

/** Shared cell on the one-row carton bar: */
export const STATION_CHROME_CELL_CLASS = [
  'flex h-full min-h-0 shrink-0 items-center',
  STATION_CHROME_CELL_CLASS_MARK,
].join(' ');

/** Gap between icons / chips — same integer as GlobalHeader. */
export const stationIdentityGapClass = HEADER_ICON_GAP;

/**
 * More-details inside the context-bar host — `top-0` of that host + right inset.
 * When Ticket push squeezes Unbox, mount on the pane with
 * {@link stationMoreDetailsPaneHostClass} instead.
 */
export const stationMoreDetailsHostClass =
  `pointer-events-auto absolute top-0 ${STATION_IDENTITY_INSET_RIGHT} flex items-start`;

/**
 * Pane-anchored more-details — same top/right insets. `z-panelPopover` sits
 * above fullscreen Unbox push (`z-panel`) so the carton ↑↓ cursor stays
 * visible and clickable on the top-right when the column is expanded.
 */
export const stationMoreDetailsPaneHostClass =
  `pointer-events-auto absolute ${STATION_IDENTITY_INSET_TOP} ${STATION_IDENTITY_INSET_RIGHT} z-panelPopover flex items-start`;

/**
 * One-row identity clearance (~28px flush at `top-0`, zero Y-pad).
 */
export const STATION_IDENTITY_SCROLL_CLEARANCE = 'pt-7';

/**
 * Two-row identity clearance (~52px = chrome `h-7` + secondary `h-6`, gap-0 +
 * zero Y-pad). Opt in via `StationWorkbench reserveIdentityClearance="stacked"`.
 */
// ds-allow-spacing: stacked identity overlay = station h-7 + secondary h-6 (not a density step).
export const STATION_IDENTITY_STACKED_SCROLL_CLEARANCE = 'pt-[52px]'; // ds-allow-spacing
