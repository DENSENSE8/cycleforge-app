/**
 * Station identity chrome — coplanar flush band under GlobalHeader.
 *
 * Identity sits **flush under GlobalHeader** on the sunken work plane: square
 * all sides, hairline bottom seam only, no elevation. {@link STATION_WORKBENCH_COLUMN}
 * (edge-to-edge of the center column; Displays locks the column at 720 when
 * open) paints an opaque **white card face** (`bg-surface-card`) so carton
 * context, PO lines, and the notes dock share one measure — no `mx-auto`
 * sunken gutters. Icon gap matches GlobalHeader via {@link HEADER_ICON_GAP}.
 *
 * ## Top inset SoT
 *
 * {@link STATION_IDENTITY_INSET_TOP} (`top-0`) pins identity + more-details
 * under the header. {@link STATION_IDENTITY_INSET_RIGHT} (`right-2`) keeps the
 * trailing utility cluster off the right edge. Never stack host `py-*` under
 * this float. Inner pad is zero — content abuts the band edges.
 */
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

/**
 * In-flow host for {@link StationContextBar} — identity is a shrink-0 sibling
 * above the workbench scroll port so the hairline bottom abuts PO lines with
 * **zero** guessed `pt-*` clearance. Use with
 * `StationWorkbench reserveIdentityClearance={false}`.
 */
export const stationContextBarFlowHostClass = 'relative shrink-0';

/**
 * Identity strip — coplanar flush white face on the locked 720 measure: square
 * all sides, no panel border (the carton bar paints
 * {@link STATION_CHROME_SEAM_HAIRLINE} so it meets Displays' overlay seam at
 * one Y). Opaque card fill (same plane as PO lines). Compose with
 * `STATION_WORKBENCH_COLUMN` — do not paint this on a full-bleed host.
 */
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

/**
 * Station chrome seam — carton identity row 1, Displays push top, and desk
 * inspector chrome (`DeskRailChromeRow` / leaf band / host `X`).
 *
 * **28px / `h-7`** — same pixel height as {@link PRIMARY_CHROME_ROW_FACE},
 * plus `max-h-7 min-h-0` so flex content cannot grow one column past the
 * other. Do not restyle this to `h-9`. **Not** the GlobalHeader / spine top
 * band (`TOP_CHROME_ROW_FACE` / 40px) — that seam sits above this one.
 */
export const STATION_CHROME_ROW_FACE = 'h-7 max-h-7 min-h-0 shrink-0';

/**
 * Bottom hairline on a station chrome row — painted via `after:` so it does
 * **not** eat the `h-7` / `h-6` box (border-box `border-b` would shrink the
 * fill) and does **not** notch a parent `border-l` (Displays seam). Same token
 * as Displays top band · identity row 1 · leaf eyebrows.
 */
export const STATION_CHROME_SEAM_HAIRLINE =
  'relative after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border-subtle';

/**
 * Square hit cell on the Displays top band — same 28px as
 * {@link STATION_CHROME_ROW_FACE} and `IconButton size="sm"`. Verbs, maximize,
 * and close all compose this so ⤢ and X share one pitch (never a `w-8` verb
 * beside an unsized window control, and never `-ml-px` overlap on close).
 */
export const STATION_DISPLAYS_PUSH_TOP_CELL =
  'pointer-events-auto flex h-full w-7 shrink-0 items-stretch';

/**
 * Trailing cluster on the Displays top band — verbs · ⤢ · X. Same
 * {@link HEADER_ICON_GAP} (`gap-0`) as GlobalHeader and carton identity;
 * hover seam is the divider. Never a nested `gap-0.5`.
 */
export const STATION_DISPLAYS_PUSH_TOP_CLUSTER =
  `pointer-events-auto flex h-full shrink-0 items-stretch ${HEADER_ICON_GAP}`;

/**
 * Displays / desk-inspector top chrome row — same face as carton identity
 * ({@link STATION_CHROME_ROW_FACE}). {@link StationDisplaysPushColumn} and
 * desk {@link DeskInspectorIndexShell} compose this class; do not fork a
 * `h-7` twin. Lives here (not on the Displays barrel) so desk inspectors
 * can import the token without evaluating CartonContextCard.
 *
 * **No leading pad and no TRAILING pad (2026-08-19).** Back owns the column's
 * left corner and close owns the right one (sash still grabs under empty
 * chrome). The band used to carry a 6px `pr-1.5` trailing inset, which left the
 * `✕` floating 6px off the column's own edge — the dismiss is the control an
 * operator throws the pointer at without looking, and a flush corner is an
 * infinite-width target while a 6px inset makes it a 28px one. Same ruling as
 * the desk host `X` (`right-0`).
 */
/**
 * Desk inspector top band for panels whose BODY carries a `px-4` content
 * gutter — the eyebrow's ink lands on the body's own left edge instead of a
 * tighter chrome inset.
 *
 * Same contract as {@link STATION_DISPLAYS_PUSH_TOP_BAND}, one step wider on
 * the leading edge. Promoted 2026-08-19: `GridColumnDetailsPanel` and
 * `IncomingBulkTrackingPanel` each declared this exact string, so the trailing
 * inset had to be fixed twice and could drift apart again at any time.
 *
 * `gap-1.5` here is a CONTENT gap (truncating eyebrow → reserved close cell),
 * not an icon-cluster gap — icon clusters still abut at `gap-0`.
 *
 * Trailing edge is `pr-0` — these bands reserve the cell the host `X` paints
 * over, and that `X` sits at `right-0`.
 */
export const DESK_INSPECTOR_GUTTER_TOP_BAND =
  `relative z-header flex ${STATION_CHROME_ROW_FACE} items-stretch gap-1.5 pl-4 pr-0 ${STATION_CHROME_SEAM_HAIRLINE}`;

export const STATION_DISPLAYS_PUSH_TOP_BAND =
  `pointer-events-none relative z-header flex ${STATION_CHROME_ROW_FACE} items-stretch ${HEADER_ICON_GAP} pr-0 ${STATION_CHROME_SEAM_HAIRLINE}`;

/**
 * Classify urgency·platform·type — **one token**: flush abut (`gap-0`), no
 * side hairlines. Soft drop shadows live off these faces (`shadow-none` on
 * the tone SoTs); never reintroduce `gap-1.5` spacing or vertical rules
 * between classify pills. Chip-to-chip step on chrome row 1 is the same
 * flush abut (`gap-0` + {@link STATION_CHROME_ROW_FACE} +
 * {@link STATION_CHROME_SEAM_HAIRLINE}) composed on the carton identity bar.
 */
export const STATION_IDENTITY_GROUP_CLASS =
  'flex h-full min-h-0 items-stretch gap-0';

/**
 * Leading column on chrome row 1 — boxed exit chevron. Square track on
 * {@link STATION_CHROME_ROW_FACE}; child fills flush (`h-full w-full`).
 * Lifecycle status is the content-width cell immediately AFTER this column and
 * before the order # — state, then which carton — not part of this column.
 */
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

/**
 * Text face for EVERY cell on the one-row carton bar — alias of the house
 * {@link chipText} preset, so the bar and dense CopyChips elsewhere in the app
 * are the same face by construction rather than by two strings that happen to
 * agree today.
 *
 * A cell owns its GEOMETRY ({@link STATION_CHROME_CELL_CLASS},
 * {@link STATION_CHROME_CELL_PAD}) and its TONE (Photos blue wash, Claim orange
 * wash) — it does **not** own its type. No cell may declare `font-*`,
 * `tracking-*`, or a `text-role-*` size of its own.
 *
 * **Ink is not in this token.** Semantic colour belongs on the GLYPH
 * (`CHIP_TONES.price.iconClass`, `platformMetaIconTone`), never on the label:
 * painting the label is exactly what left `$41.99` reading `text-text-muted`
 * gray while `eBay` two cells over read default ink at the same 12px. Neutral
 * cells compose {@link STATION_CHROME_CELL_INK}; tone cells keep their own.
 *
 * Guard: `carton-chrome-type-unity.guard.test.ts`.
 */
export const STATION_CHROME_CELL_TEXT = chipText;

/**
 * Word face for bar cells whose content is a LABEL, not a value — Claim, the
 * platform name, the classify pills. Same metrics as
 * {@link STATION_CHROME_CELL_TEXT}; proportional family instead of mono.
 *
 * Two faces, one scale. Mono is load-bearing on IDs and money (character-by-
 * character scanning, tabular figures); it is noise on a word. Forcing `Claim`
 * into mono to satisfy "one token" traded a real affordance for a bookkeeping
 * win — the row reads as one system because the METRICS match, not because the
 * family does. Family is the single axis permitted to vary here; a cell may
 * pick this or {@link STATION_CHROME_CELL_TEXT} and nothing else.
 */
export const STATION_CHROME_CELL_LABEL = chipLabel;

/**
 * Default label ink for a neutral (non-tone) bar cell — order #, tracking,
 * ticket, price, listing. Split from {@link STATION_CHROME_CELL_TEXT} so the
 * tone cells can paint their own without two `text-*` utilities colliding in
 * one class string.
 */
export const STATION_CHROME_CELL_INK = 'text-text-default';

/**
 * Chrome glyph box — same optical size as exit / back (`h-3.5`).
 * Listing · claim · photos · price mark · overflow all use this box.
 */
export const STATION_CHROME_GLYPH_CLASS = 'block h-3.5 w-3.5 shrink-0';



/**
 * **The hover display for a station chrome row — opt in, don't compose.**
 *
 * `STATION_CHROME_ROW_CLASS` on the row, {@link STATION_CHROME_CELL_CLASS_MARK}
 * on each cell. The display itself — wash, box, and the cell's stacking — lives
 * in ONE unlayered rule in `styles/globals.css` (`.cf-chrome-row .cf-chrome-cell`).
 *
 * This replaced a Tailwind string that every face composed for itself. A string
 * cannot stop a call site re-spelling half of it, gating the halves apart, or
 * adding a `z-index` that changes how it paints without touching the token, and
 * all three shipped. Marker in, whole display out — there is no half of this to
 * compose.
 *
 * Change the look in that one CSS block and every station follows: Unbox,
 * Triage, Testing, Labels, Ready-to-Pack, Pack, search, support, review.
 */
export const STATION_CHROME_ROW_CLASS = 'cf-chrome-row';

/** Cell opt-in. Rides inside the shared cell classes below — see the CSS. */
export const STATION_CHROME_CELL_CLASS_MARK = 'cf-chrome-cell';

/**
 * Cell that steps its OWN wash (Photos blue, Claim orange, Pickup emerald) and
 * therefore skips the neutral fill. It still takes the box — the strip
 * delineates uniformly; only the colour of the wash is the tone's business.
 */
export const STATION_CHROME_TONE_CLASS_MARK = 'cf-chrome-tone';


/**
 * Interactive cell on the carton bar that is NOT one of the button faces in
 * `station-context-action-pill.ts` — i.e. the identity chips (order #,
 * tracking #, ticket). Those chips are `inline-flex` and vertically centred, so
 * left to themselves their hover box would be shorter than the row and the strip
 * would delineate at two different heights. This wrapper hands them the same
 * `h-full` cell box, seam and fill that every other interactive cell has.
 *
 * Read-only facts (status dot, qty, price) compose
 * {@link STATION_CHROME_CELL_CLASS}, which now carries the SAME seam + fill —
 * so they box on hover identically; this variant only adds `items-stretch` for
 * the inline chips whose own box would otherwise be shorter than the row.
 */
export const STATION_CHROME_HOVER_CELL_CLASS = [
  'flex h-full min-h-0 shrink-0 items-stretch',
  STATION_CHROME_CELL_CLASS_MARK,
].join(' ');

/**
 * Shared cell on the one-row carton bar: fill chrome height, vertical center,
 * and draw the hover box (seam + fill) so status dot / qty / price delineate
 * the same as every interactive cell. Chip faces keep their own `px-1.5`;
 * status / price compose {@link STATION_CHROME_CELL_PAD}. No leading hairline —
 * the bar is one continuous strip (no `border-l` / `divide-x` between cells).
 */
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
